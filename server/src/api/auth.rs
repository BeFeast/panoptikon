use axum::{
    extract::{ConnectInfo, Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, warn};

use super::AppState;

// ---------- Rate limiting ----------

const MAX_LOGIN_ATTEMPTS: usize = 5;
const RATE_LIMIT_WINDOW_SECS: u64 = 60;

/// Per-IP sliding-window rate limiter for failed login attempts.
#[derive(Clone)]
pub struct LoginRateLimiter {
    /// Map from IP address to timestamps of recent failed login attempts.
    attempts: Arc<DashMap<IpAddr, Vec<Instant>>>,
}

impl LoginRateLimiter {
    pub fn new() -> Self {
        Self {
            attempts: Arc::new(DashMap::new()),
        }
    }

    /// Atomically check the rate limit and, if not exceeded, reserve a slot.
    ///
    /// Returns `Some(retry_after_secs)` if the limit is already hit (caller
    /// should return 429 immediately). Returns `None` if the attempt is allowed
    /// and has been recorded in a single lock operation, preventing the TOCTOU
    /// race that would occur if check and record were separate calls.
    ///
    /// On successful authentication call [`clear`] to remove the reserved slot.
    pub fn try_login_attempt(&self, ip: &IpAddr) -> Option<u64> {
        let window = std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);
        let now = Instant::now();

        let mut entry = self.attempts.entry(*ip).or_default();
        // Prune timestamps outside the sliding window.
        entry.retain(|t| now.duration_since(*t) < window);

        if entry.len() >= MAX_LOGIN_ATTEMPTS {
            // Limit hit — return retry-after without reserving another slot.
            let oldest = entry.first().unwrap();
            let elapsed = now.duration_since(*oldest);
            let retry_after = window.saturating_sub(elapsed).as_secs().max(1);
            return Some(retry_after);
        }

        // Reserve a slot by recording this attempt now.
        entry.push(now);
        None
    }

    /// Clear the rate-limit counter for the given IP (call on successful login).
    pub fn clear(&self, ip: &IpAddr) {
        self.attempts.remove(ip);
    }

    /// Remove all entries whose window has fully expired.
    /// Call periodically to prevent unbounded map growth from IPs that
    /// fail but never succeed (and thus never get cleared).
    pub fn cleanup_stale(&self) {
        let window = std::time::Duration::from_secs(RATE_LIMIT_WINDOW_SECS);
        let now = Instant::now();
        self.attempts.retain(|_, attempts| {
            attempts.retain(|t| now.duration_since(*t) < window);
            !attempts.is_empty()
        });
    }
}

/// Extract the real client IP address.
///
/// Only trusts `X-Forwarded-For` when the TCP peer address matches a configured
/// trusted proxy, preventing spoofing by external clients. Falls back to the
/// direct connection IP otherwise.
fn extract_client_ip(headers: &HeaderMap, addr: SocketAddr, trusted_proxies: &[String]) -> IpAddr {
    let peer_ip = addr.ip();

    let peer_is_trusted = trusted_proxies.iter().any(|proxy| {
        proxy
            .parse::<IpAddr>()
            .map(|trusted| trusted == peer_ip)
            .unwrap_or(false)
    });

    if peer_is_trusted {
        if let Some(forwarded_for) = headers.get("x-forwarded-for") {
            if let Ok(value) = forwarded_for.to_str() {
                // X-Forwarded-For may contain "client, proxy1, proxy2" — take the first.
                if let Some(first_ip) = value.split(',').next() {
                    if let Ok(ip) = first_ip.trim().parse::<IpAddr>() {
                        return ip;
                    }
                }
            }
        }
    }

    peer_ip
}

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
///
/// Rate-limited: after 5 failed password attempts within 60 seconds the
/// endpoint returns `429 Too Many Requests` with a `Retry-After` header.
pub async fn login(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> Result<Response, Response> {
    let client_ip = extract_client_ip(&headers, addr, &state.config.auth.trusted_proxies);

    // Atomically check rate limit and reserve a slot. This prevents TOCTOU races
    // where concurrent requests could all pass a separate check() before any
    // record_failure() is called. The slot is cleared on successful login.
    if let Some(retry_after) = state.rate_limiter.try_login_attempt(&client_ip) {
        warn!(%client_ip, "Login rate limit exceeded");
        let mut resp = StatusCode::TOO_MANY_REQUESTS.into_response();
        resp.headers_mut().insert(
            header::HeaderName::from_static("retry-after"),
            header::HeaderValue::from_str(&retry_after.to_string())
                .unwrap_or(header::HeaderValue::from_static("60")),
        );
        return Err(resp);
    }

    // Retrieve the stored admin password hash from settings.
    let row: Option<String> =
        sqlx::query("SELECT value FROM settings WHERE key = 'admin_password_hash'")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to query settings: {e}");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            })?
            .and_then(|r| r.try_get("value").ok());

    let password_hash = match row {
        Some(hash) => {
            // Verify password against stored hash.
            let valid = bcrypt::verify(&body.password, &hash).map_err(|e| {
                tracing::error!("Password verification error: {e}");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            })?;

            if !valid {
                // Slot was already reserved by try_login_attempt(); no separate record needed.
                warn!(%client_ip, "Failed login attempt");
                return Err(StatusCode::UNAUTHORIZED.into_response());
            }
            hash
        }
        None => {
            // First-run: no password set yet. Validate minimum length before storing.
            if body.password.len() < 8 {
                return Err(StatusCode::UNPROCESSABLE_ENTITY.into_response());
            }
            let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST).map_err(|e| {
                tracing::error!("Failed to hash password: {e}");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            })?;
            sqlx::query("INSERT INTO settings (key, value) VALUES ('admin_password_hash', ?)")
                .bind(&hash)
                .execute(&state.db)
                .await
                .map_err(|e| {
                    tracing::error!("Failed to store password: {e}");
                    StatusCode::INTERNAL_SERVER_ERROR.into_response()
                })?;
            tracing::info!("Admin password set for the first time");
            hash
        }
    };

    let _ = password_hash; // used above

    // Generate session token and store it in the database.
    let token = uuid::Uuid::new_v4().to_string();
    // Ensure at least 1 second; a zero expiry would create an immediately-invalid session.
    let expiry_secs = state.config.auth.session_expiry_seconds.max(1);
    let expiry_modifier = format!("+{expiry_secs} seconds");

    sqlx::query("INSERT INTO sessions (token, expires_at) VALUES (?, datetime('now', ?))")
        .bind(&token)
        .bind(&expiry_modifier)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to store session: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        })?;

    // Clear rate-limiter only after session is successfully persisted.
    state.rate_limiter.clear(&client_ip);

    tracing::info!(%client_ip, "Admin logged in, session created");

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
        header::HeaderValue::from_str(&cookie).expect("cookie value is always valid ASCII"),
    );

    Ok(response)
}

/// Change-password request body.
#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// POST /api/v1/auth/change-password — change the admin password (requires auth session).
pub async fn change_password(
    State(state): State<AppState>,
    Json(body): Json<ChangePasswordRequest>,
) -> Result<StatusCode, StatusCode> {
    if body.new_password.len() < 8 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    // Fetch current hash.
    let row: Option<String> =
        sqlx::query("SELECT value FROM settings WHERE key = 'admin_password_hash'")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to query settings: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .and_then(|r| r.try_get("value").ok());

    let current_hash = row.ok_or(StatusCode::NOT_FOUND)?;

    // Verify current password.
    let valid = bcrypt::verify(&body.current_password, &current_hash).map_err(|e| {
        tracing::error!("Password verification error: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if !valid {
        warn!("Change-password: wrong current password");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Hash new password and update.
    let new_hash = bcrypt::hash(&body.new_password, bcrypt::DEFAULT_COST).map_err(|e| {
        tracing::error!("Failed to hash new password: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query("UPDATE settings SET value = ? WHERE key = 'admin_password_hash'")
        .bind(&new_hash)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update password: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Invalidate all existing sessions so the new password takes effect immediately.
    sqlx::query("DELETE FROM sessions")
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to clear sessions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    tracing::info!("Admin password changed, all sessions invalidated");
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/auth/logout — clear session cookie.
pub async fn logout(State(state): State<AppState>, req: Request) -> impl IntoResponse {
    // Try to extract and remove the session from the database.
    if let Some(token) = extract_session_token(&req) {
        if let Err(e) = sqlx::query("DELETE FROM sessions WHERE token = ?")
            .bind(&token)
            .execute(&state.db)
            .await
        {
            tracing::warn!(error = %e, "Failed to delete session on logout");
        }
    }

    let cookie = "panoptikon_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";

    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        header::HeaderValue::from_str(cookie).expect("cookie value is always valid ASCII"),
    );
    response
}

/// GET /api/v1/auth/status — check whether the user is authenticated and
/// whether the system needs initial password setup.
pub async fn status(
    State(state): State<AppState>,
    req: Request,
) -> Result<Json<AuthStatusResponse>, StatusCode> {
    let needs_setup = sqlx::query("SELECT 1 FROM settings WHERE key = 'admin_password_hash'")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to query settings: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .is_none();

    let authenticated = if let Some(token) = extract_session_token(&req) {
        sqlx::query("SELECT 1 FROM sessions WHERE token = ? AND expires_at > datetime('now')")
            .bind(&token)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to check session: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .is_some()
    } else {
        false
    };

    Ok(Json(AuthStatusResponse {
        authenticated,
        needs_setup,
    }))
}

/// Auth middleware: protects routes by checking the session cookie.
pub async fn auth_middleware(State(state): State<AppState>, req: Request, next: Next) -> Response {
    let token = extract_session_token(&req);

    let session_row = if let Some(ref token) = token {
        match sqlx::query("SELECT 1 FROM sessions WHERE token = ? AND expires_at > datetime('now')")
            .bind(token)
            .fetch_optional(&state.db)
            .await
        {
            Ok(row) => row,
            Err(e) => {
                tracing::error!(error = %e, "DB error in auth middleware");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        }
    } else {
        None
    };

    if session_row.is_none() {
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

#[cfg(test)]
mod tests {
    use crate::db;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> sqlx::SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    // ── Auth-side tests ──────────────────────────────────────────────

    #[tokio::test]
    async fn test_valid_session_found() {
        let pool = test_db().await;

        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_valid', datetime('now', '+3600 seconds'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sessions WHERE token = 'tok_valid' AND expires_at > datetime('now')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            count, 1,
            "A session expiring in the future must be found by the auth query"
        );
    }

    #[tokio::test]
    async fn test_expired_session_rejected() {
        let pool = test_db().await;

        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_expired', datetime('now', '-1 second'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sessions WHERE token = 'tok_expired' AND expires_at > datetime('now')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            count, 0,
            "An expired session must NOT be returned by the auth query"
        );
    }

    #[tokio::test]
    async fn test_boundary_session_rejected() {
        let pool = test_db().await;

        // Insert a session whose expires_at is exactly "now".
        // With strict `>` the session must NOT be considered valid.
        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_boundary', datetime('now'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sessions WHERE token = 'tok_boundary' AND expires_at > datetime('now')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            count, 0,
            "A session expiring at exactly 'now' must NOT pass the auth check (strict >)"
        );
    }

    // ── Purge-side tests ─────────────────────────────────────────────

    #[tokio::test]
    async fn test_purge_removes_expired() {
        let pool = test_db().await;

        // One expired, one valid.
        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES \
             ('tok_old', datetime('now', '-1 second')), \
             ('tok_fresh', datetime('now', '+3600 seconds'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        // Purge (must use <=, matching production code in db::run_migrations).
        sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(
            remaining, 1,
            "Only the valid session should survive the purge"
        );

        // Make sure the surviving session is the right one.
        let token: String = sqlx::query_scalar("SELECT token FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(
            token, "tok_fresh",
            "The surviving session must be the valid one"
        );
    }

    #[tokio::test]
    async fn test_purge_removes_boundary_expired() {
        // REGRESSION TEST: with the old `< datetime('now')` a boundary session
        // was never purged. The fix changed it to `<=`.
        let pool = test_db().await;

        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_boundary', datetime('now'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
            .execute(&pool)
            .await
            .unwrap();

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(
            remaining, 0,
            "Purge with <= must remove a session expiring at exactly 'now' \
             (this is the regression that the < vs <= bug would have missed)"
        );
    }

    #[tokio::test]
    async fn test_purge_keeps_valid_sessions() {
        let pool = test_db().await;

        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_future', datetime('now', '+3600 seconds'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
            .execute(&pool)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(
            count, 1,
            "Purge must NOT delete sessions that are still valid"
        );
    }

    // ── Meta-regression: auth + purge consistency ────────────────────

    #[tokio::test]
    async fn test_auth_purge_consistency() {
        // A session at exact boundary must be:
        //   1. Rejected by auth (expires_at > datetime('now') → false)
        //   2. Cleaned up by purge (expires_at <= datetime('now') → true)
        // If EITHER side used the wrong operator, sessions would leak.
        let pool = test_db().await;

        sqlx::query(
            "INSERT INTO sessions (token, expires_at) VALUES ('tok_edge', datetime('now'))",
        )
        .execute(&pool)
        .await
        .unwrap();

        // 1. Auth check: must NOT find the session.
        let auth_found: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sessions WHERE token = 'tok_edge' AND expires_at > datetime('now')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            auth_found, 0,
            "Auth must reject a boundary-expired session (strict >)"
        );

        // 2. Purge: must delete the session.
        let deleted = sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
            .execute(&pool)
            .await
            .unwrap()
            .rows_affected();

        assert!(
            deleted >= 1,
            "Purge must remove the boundary-expired session (<=)"
        );

        // 3. Consistency: nothing left behind.
        let leftover: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE token = 'tok_edge'")
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(
            leftover, 0,
            "A session rejected by auth must also be cleaned up by purge — no leaks"
        );
    }
}
