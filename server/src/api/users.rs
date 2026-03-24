use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::{AppError, AppState};

/// A user as returned by the API (password hash never exposed).
#[derive(Debug, Serialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub role: String,
    pub email: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating a user.
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
    pub email: Option<String>,
}

/// Request body for updating a user.
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub username: Option<String>,
    pub password: Option<String>,
    pub role: Option<String>,
    pub email: Option<String>,
}

const VALID_ROLES: &[&str] = &["admin", "read-only", "operator"];

fn user_from_row(row: sqlx::sqlite::SqliteRow) -> Result<User, sqlx::Error> {
    Ok(User {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        email: row.try_get("email").ok(),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/users — list all users.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<User>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, username, role, email, created_at, updated_at FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list users: {e}");
        AppError::Internal(e.to_string())
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
) -> Result<(StatusCode, Json<User>), AppError> {
    let username = body.username.trim();
    if username.is_empty() || username.len() < 2 {
        return Err(AppError::Validation(
            "Username must be at least 2 characters".to_string(),
        ));
    }

    if body.password.len() < 8 {
        return Err(AppError::Validation(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let role = body.role.as_deref().unwrap_or("operator");
    if !VALID_ROLES.contains(&role) {
        return Err(AppError::Validation(format!(
            "Invalid role '{}'. Valid roles: {}",
            role,
            VALID_ROLES.join(", ")
        )));
    }

    let password_hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
        error!("Failed to hash password: {e}");
        AppError::Internal("Failed to hash password".to_string())
    })?;

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, role, email) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(username)
    .bind(&password_hash)
    .bind(role)
    .bind(&body.email)
    .execute(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::Conflict(format!("Username '{username}' already exists"))
        } else {
            error!("Failed to create user: {e}");
            AppError::Internal(format!("Database error: {e}"))
        }
    })?;

    info!(user_id = %id, username = username, role = role, "User created");

    let row = sqlx::query(
        "SELECT id, username, role, email, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created user: {e}");
        AppError::Internal(format!("Database error: {e}"))
    })?;

    let user =
        user_from_row(row).map_err(|e| AppError::Internal(format!("Failed to parse row: {e}")))?;

    Ok((StatusCode::CREATED, Json(user)))
}

/// PUT /api/v1/users/:id — update a user.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserRequest>,
) -> Result<Json<User>, AppError> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to check user existence: {e}");
            AppError::Internal(e.to_string())
        })?
        .is_some();

    if !exists {
        return Err(AppError::NotFound);
    }

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref username) = body.username {
        let username = username.trim();
        if username.len() < 2 {
            return Err(AppError::Validation(
                "Username must be at least 2 characters".to_string(),
            ));
        }
        sets.push("username = ?".to_string());
        binds.push(username.to_string());
    }

    if let Some(ref password) = body.password {
        if password.len() < 8 {
            return Err(AppError::Validation(
                "Password must be at least 8 characters".to_string(),
            ));
        }
        let hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| {
            error!("Failed to hash password: {e}");
            AppError::Internal(e.to_string())
        })?;
        sets.push("password_hash = ?".to_string());
        binds.push(hash);
    }

    if let Some(ref role) = body.role {
        if !VALID_ROLES.contains(&role.as_str()) {
            return Err(AppError::Validation(format!(
                "Invalid role '{}'. Valid roles: {}",
                role,
                VALID_ROLES.join(", ")
            )));
        }
        sets.push("role = ?".to_string());
        binds.push(role.to_string());
    }

    if let Some(ref email) = body.email {
        sets.push("email = ?".to_string());
        binds.push(email.to_string());
    }

    if sets.is_empty() {
        return Err(AppError::Validation("No fields to update".to_string()));
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE users SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await.map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::Conflict("Username already exists".to_string())
        } else {
            error!("Failed to update user {id}: {e}");
            AppError::Internal(e.to_string())
        }
    })?;

    info!(user_id = %id, "User updated");

    let row = sqlx::query(
        "SELECT id, username, role, email, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated user: {e}");
        AppError::Internal(e.to_string())
    })?;

    let user =
        user_from_row(row).map_err(|e| AppError::Internal(format!("Failed to parse row: {e}")))?;

    Ok(Json(user))
}

/// DELETE /api/v1/users/:id — delete a user.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    // Prevent deleting the last admin user.
    let admin_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count admins: {e}");
            AppError::Internal(e.to_string())
        })?;

    let user_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to get user role: {e}");
            AppError::Internal(e.to_string())
        })?;

    if let Some(ref role) = user_role {
        if role == "admin" && admin_count <= 1 {
            return Err(AppError::Validation(
                "Cannot delete the last admin user".to_string(),
            ));
        }
    }

    match sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            // Also delete sessions for this user.
            let _ = sqlx::query("DELETE FROM sessions WHERE user_id = ?")
                .bind(&id)
                .execute(&state.db)
                .await;

            info!(user_id = %id, "User deleted");
            Ok(StatusCode::NO_CONTENT)
        }
        Ok(_) => Err(AppError::NotFound),
        Err(e) => {
            error!("Failed to delete user {id}: {e}");
            Err(AppError::Internal(e.to_string()))
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
        let hash = bcrypt::hash("testpass123", bcrypt::DEFAULT_COST).unwrap();

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, role, email) VALUES (?, 'testuser', ?, 'operator', 'test@example.com')",
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
}
