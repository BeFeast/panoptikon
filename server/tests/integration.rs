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

/// Helper: set up a password on a fresh DB and log in, returning the client
/// (with session cookie) and base URL.
async fn login_fresh(password: &str) -> (reqwest::Client, String) {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": password}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "first-run login should succeed"
    );

    (client, base_url)
}

// ── Test 1: Login success ───────────────────────────────────────────

#[tokio::test]
async fn test_login_success() {
    let (base_url, pool) = spawn_test_server().await;

    // Set up a password first (first-run).
    let password = "correcthorsebatterystaple";
    let client = http_client();

    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": password}))
        .send()
        .await
        .expect("first-run login request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    // Now log in again with the same password (normal login).
    let resp = client
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

    drop(pool);
}

// ── Test 2: Login wrong password ────────────────────────────────────

#[tokio::test]
async fn test_login_wrong_password() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // Set up password first.
    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "my_secure_password"}))
        .send()
        .await
        .expect("first-run login failed");
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

// ── Test 3: Login first run ─────────────────────────────────────────

#[tokio::test]
async fn test_login_first_run() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // On first run with no password set, posting a valid password (≥8 chars)
    // should set the password and return 200.
    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "new_admin_password"}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "first-run login with valid password should return 200"
    );

    // Verify the session cookie was set.
    let set_cookie = resp.headers().get("set-cookie");
    assert!(
        set_cookie.is_some(),
        "Set-Cookie header must be present on first-run login"
    );
}

// ── Test 4: Login short password rejected ───────────────────────────

#[tokio::test]
async fn test_login_short_password_rejected() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // On first run, a password shorter than 8 characters should be rejected.
    let resp = client
        .post(format!("{base_url}/api/v1/auth/login"))
        .json(&serde_json::json!({"password": "short"}))
        .send()
        .await
        .expect("login request failed");

    assert_eq!(
        resp.status(),
        StatusCode::UNPROCESSABLE_ENTITY,
        "password < 8 chars should return 422"
    );
}

// ── Test 5: Agents requires auth ────────────────────────────────────

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

// ── Test 6: Agents with valid session ───────────────────────────────

#[tokio::test]
async fn test_agents_with_valid_session() {
    let (client, base_url) = login_fresh("integration_test_pw").await;

    // Now GET /api/v1/agents with the session cookie from login.
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

// ── Test 7: Auth status needs setup ─────────────────────────────────

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

// ── Test 8: ConnectInfo regression test ─────────────────────────────

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
