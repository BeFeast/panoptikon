use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{debug, warn};

use super::AppState;

/// Login request body.
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

/// Login response.
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub message: String,
}

/// Auth status response.
#[derive(Debug, Serialize)]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub needs_setup: bool,
}

/// POST /api/v1/auth/login — authenticate and set session cookie.
pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<impl IntoResponse, StatusCode> {
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
        Some(hash) => {
            // Verify password against stored hash.
            let valid = bcrypt::verify(&body.password, &hash).map_err(|e| {
                tracing::error!("Password verification error: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

            if !valid {
                warn!("Failed login attempt");
                return Err(StatusCode::UNAUTHORIZED);
            }
            hash
        }
        None => {
            // First-run: no password set yet. Accept any password and store it.
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

    let _ = password_hash; // used above

    // Generate session token and store it.
    let token = uuid::Uuid::new_v4().to_string();
    let expiry_secs = state.config.auth.session_expiry_seconds;
    let expiry = Utc::now() + Duration::seconds(expiry_secs as i64);

    state.sessions.write().await.insert(token.clone(), expiry);

    tracing::info!("Admin logged in, session created");

    // Build Set-Cookie header.
    let cookie = format!(
        "panoptikon_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={expiry_secs}"
    );

    let mut response = Json(LoginResponse {
        message: "Login successful".to_string(),
    })
    .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        cookie.parse().unwrap(),
    );

    Ok(response)
}

/// POST /api/v1/auth/logout — clear session cookie.
pub async fn logout(State(state): State<AppState>, req: Request) -> impl IntoResponse {
    // Try to extract and remove the session from the store.
    if let Some(token) = extract_session_token(&req) {
        state.sessions.write().await.remove(&token);
    }

    let cookie =
        "panoptikon_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

    let mut response = StatusCode::NO_CONTENT.into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    response
}

/// GET /api/v1/auth/status — check whether the user is authenticated and
/// whether the system needs initial password setup.
pub async fn status(
    State(state): State<AppState>,
    req: Request,
) -> Result<Json<AuthStatusResponse>, StatusCode> {
    let needs_setup =
        sqlx::query("SELECT 1 FROM settings WHERE key = 'admin_password_hash'")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to query settings: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .is_none();

    let authenticated = if let Some(token) = extract_session_token(&req) {
        let sessions = state.sessions.read().await;
        sessions
            .get(&token)
            .map(|exp| Utc::now() < *exp)
            .unwrap_or(false)
    } else {
        false
    };

    Ok(Json(AuthStatusResponse {
        authenticated,
        needs_setup,
    }))
}

/// Auth middleware: protects routes by checking the session cookie.
pub async fn auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let token = extract_session_token(&req);

    let valid = if let Some(ref token) = token {
        let sessions = state.sessions.read().await;
        sessions
            .get(token)
            .map(|exp| Utc::now() < *exp)
            .unwrap_or(false)
    } else {
        false
    };

    if !valid {
        debug!("Auth middleware rejected request (no valid session)");
        return StatusCode::UNAUTHORIZED.into_response();
    }

    next.run(req).await
}

/// Extract the session token from the Cookie header.
fn extract_session_token(req: &Request) -> Option<String> {
    let cookie_header = req.headers().get(header::COOKIE)?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let trimmed = part.trim();
        if let Some(value) = trimmed.strip_prefix("panoptikon_session=") {
            let val = value.trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}
