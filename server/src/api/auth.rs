use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

/// Login request body.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Login response.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
}

/// POST /api/v1/auth/login — authenticate and receive a session token.
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, StatusCode> {
    // Retrieve the stored admin password hash from settings.
    let row: Option<String> =
        sqlx::query("SELECT value FROM settings WHERE key = 'admin_password_hash'")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to query settings: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .and_then(|r| r.try_get("value").ok());

    let password_hash = match row {
        Some(hash) => hash,
        None => {
            // No password set yet — first-time setup: hash and store the provided password.
            let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
                tracing::error!("Failed to hash password: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            sqlx::query("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)")
                .bind(&hash)
                .execute(&state.db)
                .await
                .map_err(|e| {
                    tracing::error!("Failed to store password: {e}");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            tracing::info!("Admin password set for the first time");
            hash
        }
    };

    // Verify credentials.
    if body.username != "admin" {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let valid = bcrypt::verify(&body.password, &password_hash).map_err(|e| {
        tracing::error!("Password verification error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Generate a simple session token.
    // TODO: Use proper JWT or signed session cookies.
    let token = uuid::Uuid::new_v4().to_string();

    Ok(Json(LoginResponse { token }))
}

/// POST /api/v1/auth/logout — invalidate the current session.
pub async fn logout() -> StatusCode {
    // TODO: Invalidate the session token server-side.
    StatusCode::NO_CONTENT
}
