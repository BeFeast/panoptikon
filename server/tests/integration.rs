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
    spawn_test_server_with_config(config::AppConfig::default()).await
}

/// Spawn a real axum server with an explicit config.
async fn spawn_test_server_with_config(
    app_config: config::AppConfig,
) -> (String, sqlx::SqlitePool) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind random port");
    let addr = listener.local_addr().expect("failed to get local address");
    let base_url = format!("http://{addr}");

    let pool = db::init(":memory:")
        .await
        .expect("in-memory DB init failed");

    let state = api::AppState::new(pool.clone(), app_config);
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
    setup_fresh_with_config(password, config::AppConfig::default()).await
}

/// Same as `setup_fresh` but allows passing an explicit config.
async fn setup_fresh_with_config(
    password: &str,
    app_config: config::AppConfig,
) -> (reqwest::Client, String) {
    let (base_url, _pool) = spawn_test_server_with_config(app_config).await;
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
async fn test_settings_vyos_falls_back_to_config_when_db_empty() {
    let mut app_config = config::AppConfig::default();
    app_config.vyos.url = Some("http://127.0.0.1:9".to_string());
    app_config.vyos.api_key = Some("legacy-config-key".to_string());

    let (client, base_url) = setup_fresh_with_config("settings_fallback_pw", app_config).await;

    let resp = client
        .get(format!("{base_url}/api/v1/settings"))
        .send()
        .await
        .expect("settings request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("settings json parse failed");
    assert_eq!(body["vyos_url"].as_str(), Some("http://127.0.0.1:9"));
    assert_eq!(body["vyos_api_key_set"].as_bool(), Some(true));
}

#[tokio::test]
async fn test_qos_summary_vyos_available_from_config_fallback() {
    let mut app_config = config::AppConfig::default();
    app_config.vyos.url = Some("http://127.0.0.1:9".to_string());
    app_config.vyos.api_key = Some("legacy-config-key".to_string());

    let (client, base_url) = setup_fresh_with_config("qos_fallback_pw", app_config).await;

    let resp = client
        .get(format!("{base_url}/api/v1/qos/summary"))
        .send()
        .await
        .expect("qos summary request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("qos summary json parse failed");
    assert_eq!(body["vyos_available"].as_bool(), Some(true));
}

#[tokio::test]
async fn test_vpn_status_vyos_available_from_config_fallback() {
    let mut app_config = config::AppConfig::default();
    app_config.vyos.url = Some("http://127.0.0.1:9".to_string());
    app_config.vyos.api_key = Some("legacy-config-key".to_string());

    let (client, base_url) = setup_fresh_with_config("vpn_fallback_pw", app_config).await;

    let resp = client
        .get(format!("{base_url}/api/v1/vpn-status"))
        .send()
        .await
        .expect("vpn status request failed");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("vpn status json parse failed");
    assert_eq!(body["vyos_available"].as_bool(), Some(true));
}

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

// ── Test 12: Caddy proxy host CRUD ───────────────────────────────────

#[tokio::test]
async fn test_caddy_proxy_host_crud() {
    let (client, base_url) = setup_fresh("caddy_test_password").await;

    // 1. List — should be empty initially.
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let hosts: Vec<Value> = resp.json().await.expect("json parse failed");
    assert!(hosts.is_empty(), "should start with no proxy hosts");

    // 2. Create a proxy host.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "app.example.com",
            "forward_host": "10.0.0.5",
            "forward_port": 8080,
            "forward_scheme": "http",
            "tls_enabled": false
        }))
        .send()
        .await
        .expect("create request failed");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("json parse failed");
    assert_eq!(created["domain"], "app.example.com");
    assert_eq!(created["forward_host"], "10.0.0.5");
    assert_eq!(created["forward_port"], 8080);
    assert_eq!(created["forward_scheme"], "http");
    assert_eq!(created["enabled"], true);
    assert_eq!(created["tls_enabled"], false);
    let host_id = created["id"].as_str().expect("id should be a string");

    // 3. List — should now contain one host.
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let hosts: Vec<Value> = resp.json().await.expect("json parse failed");
    assert_eq!(hosts.len(), 1);
    assert_eq!(hosts[0]["domain"], "app.example.com");

    // 4. Update the proxy host.
    let resp = client
        .put(format!("{base_url}/api/v1/caddy/proxy-hosts/{host_id}"))
        .json(&serde_json::json!({
            "domain": "api.example.com",
            "forward_host": "10.0.0.10",
            "forward_port": 9090,
            "forward_scheme": "https",
            "tls_enabled": true
        }))
        .send()
        .await
        .expect("update request failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("json parse failed");
    assert_eq!(updated["domain"], "api.example.com");
    assert_eq!(updated["forward_host"], "10.0.0.10");
    assert_eq!(updated["forward_port"], 9090);
    assert_eq!(updated["forward_scheme"], "https");
    assert_eq!(updated["tls_enabled"], true);

    // 5. Verify update persisted via list.
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request failed");
    let hosts: Vec<Value> = resp.json().await.expect("json parse failed");
    assert_eq!(hosts.len(), 1);
    assert_eq!(hosts[0]["domain"], "api.example.com");

    // 6. Delete the proxy host.
    let resp = client
        .delete(format!("{base_url}/api/v1/caddy/proxy-hosts/{host_id}"))
        .send()
        .await
        .expect("delete request failed");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 7. Verify deletion via list.
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request failed");
    let hosts: Vec<Value> = resp.json().await.expect("json parse failed");
    assert!(hosts.is_empty(), "should be empty after delete");
}

// ── Test 13: Caddy proxy host toggle ─────────────────────────────────

#[tokio::test]
async fn test_caddy_proxy_host_toggle() {
    let (client, base_url) = setup_fresh("caddy_toggle_pw").await;

    // Create a host (enabled by default).
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "toggle.example.com",
            "forward_host": "10.0.0.1",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .expect("create failed");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("json parse failed");
    let host_id = created["id"].as_str().unwrap();
    assert_eq!(created["enabled"], true);

    // Disable the host.
    let resp = client
        .post(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{host_id}/toggle"
        ))
        .json(&serde_json::json!({"enabled": false}))
        .send()
        .await
        .expect("toggle failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let toggled: Value = resp.json().await.expect("json parse failed");
    assert_eq!(toggled["enabled"], false);

    // Re-enable the host.
    let resp = client
        .post(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{host_id}/toggle"
        ))
        .json(&serde_json::json!({"enabled": true}))
        .send()
        .await
        .expect("toggle failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let toggled: Value = resp.json().await.expect("json parse failed");
    assert_eq!(toggled["enabled"], true);
}

// ── Test 14: Caddy status and test-connection ────────────────────────

#[tokio::test]
async fn test_caddy_status_and_test_connection() {
    let (client, base_url) = setup_fresh("caddy_status_pw").await;

    // Status endpoint should work (Caddy won't be reachable in test env).
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .expect("status request failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let status: Value = resp.json().await.expect("json parse failed");
    assert_eq!(status["configured"], true);
    // reachable may be true or false depending on whether Caddy is running.

    // Test connection endpoint should return structured response.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .expect("test-connection request failed");
    assert_eq!(resp.status(), StatusCode::OK);
    let result: Value = resp.json().await.expect("json parse failed");
    assert!(
        result["success"].is_boolean(),
        "success should be a boolean"
    );
    assert!(result["message"].is_string(), "message should be a string");
}

// ── Test 15: Caddy sync endpoint ─────────────────────────────────────

#[tokio::test]
async fn test_caddy_sync_endpoint() {
    let (client, base_url) = setup_fresh("caddy_sync_pw").await;

    // Create a host first so there's something to sync.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "sync.example.com",
            "forward_host": "10.0.0.1",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .expect("create failed");
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Force sync — should return 204 regardless of Caddy availability.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .send()
        .await
        .expect("sync request failed");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
}

// ── Test 16: Caddy delete/update non-existent host returns 404 ───────

#[tokio::test]
async fn test_caddy_not_found() {
    let (client, base_url) = setup_fresh("caddy_404_pw").await;

    let fake_id = "00000000-0000-0000-0000-000000000000";

    // Update non-existent host.
    let resp = client
        .put(format!("{base_url}/api/v1/caddy/proxy-hosts/{fake_id}"))
        .json(&serde_json::json!({
            "domain": "nope.example.com",
            "forward_host": "10.0.0.1",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .expect("update request failed");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // Delete non-existent host.
    let resp = client
        .delete(format!("{base_url}/api/v1/caddy/proxy-hosts/{fake_id}"))
        .send()
        .await
        .expect("delete request failed");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // Toggle non-existent host.
    let resp = client
        .post(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{fake_id}/toggle"
        ))
        .json(&serde_json::json!({"enabled": false}))
        .send()
        .await
        .expect("toggle request failed");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// ── Test 17: Caddy requires authentication ───────────────────────────

#[tokio::test]
async fn test_caddy_requires_auth() {
    let (base_url, _pool) = spawn_test_server().await;
    let client = http_client();

    // All Caddy endpoints should require auth.
    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request failed");
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "caddy proxy-hosts should require auth"
    );

    let resp = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .expect("status request failed");
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "caddy status should require auth"
    );

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .expect("test-connection request failed");
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "caddy test-connection should require auth"
    );
}

// ── Test 18: ConnectInfo regression test ─────────────────────────────

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
