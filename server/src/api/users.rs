use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::AppState;

/// A user as returned by the API (password hash never exposed).
#[derive(Debug, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating a user.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
}

/// Request body for updating a user.
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub role: Option<String>,
    pub password: Option<String>,
}

const VALID_ROLES: &[&str] = &["admin", "operator", "readonly"];

fn user_from_row(row: sqlx::sqlite::SqliteRow) -> Result<User, sqlx::Error> {
    Ok(User {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/users — list all users.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<User>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at ASC",
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

/// POST /api/v1/users — create a new user.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<User>), (StatusCode, String)> {
    let username = body.username.trim().to_string();
    if username.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Username is required".to_string()));
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
                "Invalid role '{role}'. Valid roles: {}",
                VALID_ROLES.join(", ")
            ),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
        error!("Failed to hash password: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to hash password".to_string(),
        )
    })?;

    sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&username)
        .bind(&password_hash)
        .bind(role)
        .execute(&state.db)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint") {
                (
                    StatusCode::CONFLICT,
                    format!("Username '{username}' already exists"),
                )
            } else {
                error!("Failed to create user: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Database error: {e}"),
                )
            }
        })?;

    info!(user_id = %id, username = %username, role = role, "User created");

    let row =
        sqlx::query("SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?")
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

/// PUT /api/v1/users/:id — update a user's role or password.
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
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?
        .is_some();

    if !exists {
        return Err((StatusCode::NOT_FOUND, "User not found".to_string()));
    }

    if let Some(ref role) = body.role {
        if !VALID_ROLES.contains(&role.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!(
                    "Invalid role '{role}'. Valid roles: {}",
                    VALID_ROLES.join(", ")
                ),
            ));
        }
        sqlx::query("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
            .bind(role)
            .bind(&id)
            .execute(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to update user role: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
            })?;
        info!(user_id = %id, role = %role, "User role updated");
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
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
        sqlx::query(
            "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(&hash)
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to update user password: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;
        info!(user_id = %id, "User password updated");
    }

    let row =
        sqlx::query("SELECT id, username, role, created_at, updated_at FROM users WHERE id = ?")
            .bind(&id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to fetch updated user: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
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
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            info!(user_id = %id, "User deleted");
            StatusCode::NO_CONTENT
        }
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete user {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::db;

    #[tokio::test]
    async fn test_user_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("testpassword123", bcrypt::DEFAULT_COST).unwrap();

        sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind("testuser")
            .bind(&hash)
            .bind("operator")
            .execute(&pool)
            .await
            .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(count, 1);

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

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn test_user_role_constraint() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let hash = bcrypt::hash("testpassword123", bcrypt::DEFAULT_COST).unwrap();

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
            "INSERT INTO users (id, username, password_hash, role) VALUES ('bad', 'baduser', ?, 'superadmin')",
        )
        .bind(&hash)
        .execute(&pool)
        .await;

        assert!(result.is_err(), "Invalid role should fail CHECK constraint");
    }

    #[tokio::test]
    async fn test_user_unique_username() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let hash = bcrypt::hash("testpassword123", bcrypt::DEFAULT_COST).unwrap();

        sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES ('id1', 'dupuser', ?, 'admin')")
            .bind(&hash)
            .execute(&pool)
            .await
            .expect("First insert should succeed");

        let result = sqlx::query(
            "INSERT INTO users (id, username, password_hash, role) VALUES ('id2', 'dupuser', ?, 'readonly')",
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
