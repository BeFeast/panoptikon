use axum::{
    extract::{ConnectInfo, State},
    http::header,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tracing::info;

use super::{AppError, AppState};

/// Request body for initial setup.
#[derive(Debug, Deserialize)]
pub struct SetupRequest {
    pub password: String,
}

/// POST /api/v1/setup — first-run setup: set admin password.
///
/// This endpoint only works once. If the admin password has already been set,
/// it returns 409 Conflict.
pub async fn setup(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<SetupRequest>,
) -> Result<Response, AppError> {
    // Check if setup has already been completed (password already exists).
    let already_set: bool = sqlx::query("SELECT 1 FROM settings WHERE key = 'admin_password_hash'")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to query settings: {e}");
            AppError::Internal(e.to_string())
        })?
        .is_some();

    if already_set {
        return Err(AppError::Conflict("Setup already completed".into()));
    }

    // Validate password.
    if body.password.len() < 8 {
        return Err(AppError::Validation(
            "Password must be at least 8 characters".into(),
        ));
    }

    // Hash and store the admin password.
    let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
        tracing::error!("Failed to hash password: {e}");
        AppError::Internal(e.to_string())
    })?;

    sqlx::query("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)")
        .bind(&hash)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to store password: {e}");
            AppError::Internal(e.to_string())
        })?;

    // Mark setup as complete.
    upsert_setting(&state, "setup_complete", "true").await?;

    info!(peer = %addr, "Initial setup completed — admin password set");

    // Auto-login: create a session so the user doesn't have to log in immediately.
    let token = uuid::Uuid::new_v4().to_string();
    let expiry_secs = state.config.auth.session_expiry_seconds.max(1);
    let expiry_modifier = format!("+{expiry_secs} seconds");

    sqlx::query("INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', ?))")
        .bind(&token)
        .bind(&expiry_modifier)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to create session: {e}");
            AppError::Internal(e.to_string())
        })?;

    let cookie = format!(
        "panoptikon_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={expiry_secs}"
    );

    let mut response = Json(serde_json::json!({
        "message": "Setup complete"
    }))
    .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        header::HeaderValue::from_str(&cookie).expect("cookie value is always valid ASCII"),
    );

    Ok(response)
}

/// Helper to upsert a setting.
async fn upsert_setting(state: &AppState, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to save setting '{key}': {e}");
        AppError::Internal(e.to_string())
    })?;
    Ok(())
}
