use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::AppState;

/// A user as returned by the API (password hash is never exposed).
#[derive(Debug, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating a user.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub password: String,
    pub role: Option<String>,
}

/// Request body for updating a user.
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
}

const VALID_ROLES: &[&str] = &["admin", "operator", "readonly"];

fn user_from_row(row: sqlx::sqlite::SqliteRow) -> Result<User, sqlx::Error> {
    Ok(User {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        display_name: row.try_get("display_name").unwrap_or(None),
        email: row.try_get("email").unwrap_or(None),
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/users — list all users.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<User>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, username, display_name, email, role, created_at, updated_at \
         FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list users: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let users: Vec<User> = rows
        .into_iter()
        .filter_map(|r| user_from_row(r).ok())
        .collect();

    Ok(Json(users))
}

/// GET /api/v1/users/:id — get a single user.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<User>, StatusCode> {
    let row = sqlx::query(
        "SELECT id, username, display_name, email, role, created_at, updated_at \
         FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to get user: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match row {
        Some(r) => Ok(Json(user_from_row(r).map_err(|e| {
            error!("Failed to parse user row: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

/// POST /api/v1/users — create a new user.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<User>), (StatusCode, String)> {
    let username = body.username.trim();
    if username.is_empty() || username.len() < 2 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Username must be at least 2 characters".to_string(),
        ));
    }

    if body.password.len() < 8 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let role = body.role.as_deref().unwrap_or("readonly");
    if !VALID_ROLES.contains(&role) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "Invalid role '{}'. Valid roles: {}",
                role,
                VALID_ROLES.join(", ")
            ),
        ));
    }

    let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
        error!("Failed to hash password: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to hash password".to_string(),
        )
    })?;

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, display_name, email, password_hash, role) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(username)
    .bind(&body.display_name)
    .bind(&body.email)
    .bind(&password_hash)
    .bind(role)
    .execute(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint failed") {
            (
                StatusCode::CONFLICT,
                format!("Username '{}' already exists", username),
            )
        } else {
            error!("Failed to create user: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        }
    })?;

    info!(user_id = %id, username = username, role = role, "User created");

    let row = sqlx::query(
        "SELECT id, username, display_name, email, role, created_at, updated_at \
         FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created user: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    let user = user_from_row(row).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse row: {e}"),
        )
    })?;

    Ok((StatusCode::CREATED, Json(user)))
}

/// PUT /api/v1/users/:id — update a user.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserRequest>,
) -> Result<Json<User>, (StatusCode, String)> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to check user existence: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?
        .is_some();

    if !exists {
        return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref display_name) = body.display_name {
        sets.push("display_name = ?".to_string());
        binds.push(display_name.clone());
    }
    if let Some(ref email) = body.email {
        sets.push("email = ?".to_string());
        binds.push(email.clone());
    }
    if let Some(ref role) = body.role {
        if !VALID_ROLES.contains(&role.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!(
                    "Invalid role '{}'. Valid roles: {}",
                    role,
                    VALID_ROLES.join(", ")
                ),
            ));
        }
        sets.push("role = ?".to_string());
        binds.push(role.clone());
    }
    if let Some(ref password) = body.password {
        if password.len() < 8 {
            return Err((
                StatusCode::BAD_REQUEST,
                "Password must be at least 8 characters".to_string(),
            ));
        }
        let hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| {
            error!("Failed to hash password: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to hash password".to_string(),
            )
        })?;
        sets.push("password_hash = ?".to_string());
        binds.push(hash);
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE users SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await.map_err(|e| {
        error!("Failed to update user {id}: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    info!(user_id = %id, "User updated");

    let row = sqlx::query(
        "SELECT id, username, display_name, email, role, created_at, updated_at \
         FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated user: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    let user = user_from_row(row).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse row: {e}"),
        )
    })?;

    Ok(Json(user))
}

/// DELETE /api/v1/users/:id — delete a user.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Prevent deleting the last admin
    let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count admins: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?;

    let user_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get user role: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?;

    match user_role {
        None => return Err((StatusCode::NOT_FOUND, "User not found".to_string())),
        Some(ref role) if role == "admin" && admin_count <= 1 => {
            return Err((
                StatusCode::CONFLICT,
                "Cannot delete the last admin user".to_string(),
            ));
        }
        _ => {}
    }

    // Delete user's sessions
    sqlx::query("DELETE FROM sessions WHERE user_id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete user sessions: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?;

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete user: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?;

    info!(user_id = %id, "User deleted");
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use crate::db;

    #[tokio::test]
    async fn test_user_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("testpassword", bcrypt::DEFAULT_COST).unwrap();

        // Create
        sqlx::query(
            "INSERT INTO users (id, username, display_name, password_hash, role) \
             VALUES (?, 'testuser', 'Test User', ?, 'operator')",
        )
        .bind(&id)
        .bind(&hash)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        // At least 1 (could be 2 if admin was migrated from settings)
        assert!(count >= 1, "At least 1 user should exist");

        // Update role
        sqlx::query("UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Update failed");

        let role: String = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(role, "admin");

        // Delete
        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Delete failed");
    }

    #[tokio::test]
    async fn test_user_role_constraint() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let hash = bcrypt::hash("testpassword", bcrypt::DEFAULT_COST).unwrap();

        // Valid roles should work
        for role in &["admin", "operator", "readonly"] {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(format!("user_{role}"))
            .bind(&hash)
            .bind(role)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("Insert for role '{role}' should succeed: {e}"));
        }

        // Invalid role should fail
        let result = sqlx::query(
            "INSERT INTO users (id, username, password_hash, role) VALUES ('bad', 'bad_user', ?, 'superadmin')",
        )
        .bind(&hash)
        .execute(&pool)
        .await;

        assert!(result.is_err(), "Invalid role should fail CHECK constraint");
    }

    #[tokio::test]
    async fn test_username_unique() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let hash = bcrypt::hash("testpassword", bcrypt::DEFAULT_COST).unwrap();

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, role) VALUES ('id1', 'uniqueuser', ?, 'admin')",
        )
        .bind(&hash)
        .execute(&pool)
        .await
        .expect("First insert should succeed");

        let result = sqlx::query(
            "INSERT INTO users (id, username, password_hash, role) VALUES ('id2', 'uniqueuser', ?, 'admin')",
        )
        .bind(&hash)
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "Duplicate username should fail UNIQUE constraint"
        );
    }
}
