//! HTTP integration tests for the Panoptikon server.
//!
//! Each test spins up the REAL axum server on a random port with an in-memory
//! SQLite database and makes actual HTTP requests via `reqwest`.
//!
//! These tests catch bugs that unit tests cannot — notably the ConnectInfo
//! misconfiguration that caused a production outage (see `test_connect_info_configured`).

use std::net::SocketAddr;

use panoptikon_server::{api, config, db};
use reqwest::StatusCode;
use serde_json::Value;

/// Spawn a real axum server on a random port with an in-memory SQLite database.
///
/// Returns `(base_url, pool)` — the base URL includes the scheme and address,
/// e.g. `"http://127.0.0.1:54321"`.
async fn spawn_test_server() -> (String, sqlx::SqlitePool) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind random port");
    let addr = listener.local_addr().expect("failed to get local address");
    let base_url = format!("http://{addr}");

    let pool = db::init(":memory:")
        .await
        .expect("in-memory DB init failed");

    let config = config::AppConfig::default();
    let state = api::AppState::new(pool.clone(), config);
    let app = api::router(state);

    // CRITICAL: must use `into_make_service_with_connect_info` so that
    // handlers extracting `ConnectInfo<SocketAddr>` don't panic.
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .expect("server error");
    });

    (base_url, pool)
}

/// Build a reqwest client with cookie store enabled (for session tracking).
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .expect("failed to build reqwest client")
}

/// Helper: run setup on a fresh DB and return the client (with session cookie)
/// and base URL.
async fn setup_fresh(password: &str) -> (reqwest::Client, String) {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": password}))
        .send()
        .await
        .expect("setup request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "setup should succeed on fresh DB"
    );

    (client, base_url)
}

// ── Test 1: Login success ───────────────────────────────────────────

#[tokio::test]
async fn test_login_success() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // Run setup first.
    let password = "correcthorsebatterystaple";
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": password}))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Now log in with the same password (normal login) using a new client.
    let client2 = http_client();
    let resp = client2
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": password}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "login with correct password should return 200"
    );

    // Verify Set-Cookie header is present.
    let set_cookie = resp.headers().get("set-cookie");
    assert!(
        set_cookie.is_some(),
        "Set-Cookie header must be present on successful login"
    );
    let cookie_value = set_cookie.unwrap().to_str().unwrap();
    assert!(
        cookie_value.contains("panoptikon_session="),
        "Set-Cookie must contain panoptikon_session"
    );
}

// ── Test 2: Login wrong password ────────────────────────────────────

#[tokio::test]
async fn test_login_wrong_password() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // Run setup first.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "my_secure_password"}))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Try wrong password with a NEW client (no session cookie).
    let client2 = http_client();
    let resp = client2
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "wrong_password_here"}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "wrong password should return 401"
    );
}

// ── Test 3: Setup creates password and auto-logs in ─────────────────

#[tokio::test]
async fn test_setup_creates_password() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // On a fresh DB, POST /api/v1/setup with valid password should succeed.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "new_admin_password"}))
        .send()
        .await
        .expect("setup request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "setup with valid password should return 200"
    );

    // Verify the session cookie was set (auto-login).
    let set_cookie = resp.headers().get("set-cookie");
    assert!(
        set_cookie.is_some(),
        "Set-Cookie header must be present after setup"
    );
}

// ── Test 4: Setup short password rejected ───────────────────────────

#[tokio::test]
async fn test_setup_short_password_rejected() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // A password shorter than 8 characters should be rejected.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "short"}))
        .send()
        .await
        .expect("setup request failed");

    assert_eq!(
        resp.status(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "password < 8 chars should return 422"
    );
}

// ── Test 5: Setup cannot be called twice ────────────────────────────

#[tokio::test]
async fn test_setup_only_works_once() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // First setup should succeed.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "first_password_ok"}))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Second setup should return 409 Conflict.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "second_attempt"}))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(
        resp.status(),
        StatusCode::CONFLICT,
        "second setup call should return 409 Conflict"
    );
}

// ── Test 6: Setup with optional VyOS settings ───────────────────────

#[tokio::test]
async fn test_setup_with_vyos_settings() {
    let (base_url, pool) = spawn_test_server().await;
    let client = http_client();

    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({
            "password": "my_admin_password",
            "vyos_url": "https://192.168.1.1",
            "vyos_api_key": "secret_key_123"
        }))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify VyOS settings were stored.
    let vyos_url: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'vyos_url'")
            .fetch_optional(&pool)
            .await
            .expect("query failed");
    assert_eq!(vyos_url.as_deref(), Some("https://192.168.1.1"));

    let vyos_key: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'vyos_api_key'")
            .fetch_optional(&pool)
            .await
            .expect("query failed");
    assert_eq!(vyos_key.as_deref(), Some("secret_key_123"));

    // Verify setup_complete was set.
    let setup_complete: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = 'setup_complete'")
            .fetch_optional(&pool)
            .await
            .expect("query failed");
    assert_eq!(setup_complete.as_deref(), Some("true"));
}

// ── Test 7: Login before setup returns 428 ──────────────────────────

#[tokio::test]
async fn test_login_before_setup_returns_precondition() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // Without running setup, login should return 428 Precondition Required.
    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "any_password"}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::PRECONDITION_REQUIRED,
        "login before setup should return 428"
    );
}

// ── Test 8: Agents requires auth ────────────────────────────────────

#[tokio::test]
async fn test_agents_requires_auth() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // GET /api/v1/agents without a session cookie should return 401.
    let resp = client
        .get(format!("{base_url}/api/v1/agents"))
        .send()
        .await
        .expect("agents request failed");

    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "accessing /api/v1/agents without auth should return 401"
    );
}

// ── Test 9: Agents with valid session ───────────────────────────────

#[tokio::test]
async fn test_agents_with_valid_session() {
    let (client, base_url) = setup_fresh("integration_test_pw").await;

    // Now GET /api/v1/agents with the session cookie from setup.
    let resp = client
        .get(format!("{base_url}/api/v1/agents"))
        .send()
        .await
        .expect("agents request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "authenticated request to /api/v1/agents should return 200"
    );

    // The response should be a JSON array (empty for fresh DB).
    let body: Value = resp.json().await.expect("failed to parse JSON");
    assert!(body.is_array(), "response body should be a JSON array");
}

// ── Test 10: Auth status needs setup ────────────────────────────────

#[tokio::test]
async fn test_auth_status_needs_setup() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // On a fresh DB, /api/v1/auth/status should indicate needs_setup=true.
    let resp = client
        .get(format!("{base_url}/api/v1/auth/status"))
        .send()
        .await
        .expect("auth status request failed");

    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("failed to parse JSON");
    assert_eq!(
        body["authenticated"], false,
        "should not be authenticated on fresh DB"
    );
    assert_eq!(
        body["needs_setup"], true,
        "should need setup on fresh DB (no password set)"
    );
}

// ── Test 11: Auth status after setup ────────────────────────────────

#[tokio::test]
async fn test_auth_status_after_setup() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // Run setup.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "my_password_123"}))
        .send()
        .await
        .expect("setup request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Auth status should now show setup is complete and user is authenticated.
    let resp = client
        .get(format!("{base_url}/api/v1/auth/status"))
        .send()
        .await
        .expect("auth status request failed");

    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("failed to parse JSON");
    assert_eq!(
        body["needs_setup"], false,
        "needs_setup should be false after setup"
    );
    assert_eq!(
        body["authenticated"], true,
        "should be authenticated after setup (auto-login)"
    );
}

// ── Test 12: ConnectInfo regression test ─────────────────────────────

#[tokio::test]
async fn test_connect_info_configured() {
    // REGRESSION TEST: If `into_make_service_with_connect_info::<SocketAddr>()`
    // is missing from the server setup, handlers that extract `ConnectInfo<SocketAddr>`
    // (like the login handler) will panic, killing the connection.
    //
    // This test verifies that calling POST /login returns an actual HTTP response
    // (any status code is fine) rather than a connection error / panic.
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    let result = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "testpassword123"}))
        .send()
        .await;

    match result {
        Ok(resp) => {
            // Any HTTP response means ConnectInfo is properly configured.
            // The server didn't panic — that's what we're testing.
            assert!(
                resp.status().is_success() || resp.status().is_client_error(),
                "Expected a valid HTTP response (got {}), which confirms ConnectInfo is configured",
                resp.status()
            );
        }
        Err(e) => {
            panic!(
                "ConnectInfo regression: POST /login failed with connection error: {e}. \
                 This likely means `into_make_service_with_connect_info::<SocketAddr>()` \
                 is missing from the server setup."
            );
        }
    }
}
