//! Caddy integration tests (C-01 .. C-24).
//!
//! These tests spin up a Panoptikon server *and* require a real Caddy instance
//! with its admin API accessible at `http://localhost:2019`.
//!
//! Start Caddy before running:
//! ```bash
//! docker run -d --name caddy-test -p 2019:2019 -p 8880:80 \
//!   -v /tmp/caddy-test.json:/etc/caddy/caddy.json \
//!   caddy:2-alpine caddy run --config /etc/caddy/caddy.json
//! ```
//! where `/tmp/caddy-test.json` contains:
//! ```json
//! { "admin": { "listen": "0.0.0.0:2019" } }
//! ```
//!
//! Run with:  `cargo test --test caddy_integration`

use std::net::SocketAddr;

use panoptikon_server::{api, config, db};
use reqwest::StatusCode;
use serde_json::Value;

const CADDY_ADMIN_URL: &str = "http://localhost:2019";

// ─── Helpers ────────────────────────────────────────────────

/// Spawn a real axum server on a random port, pre-configured with
/// `caddy_admin_url` pointing at the Docker Caddy container.
async fn spawn_with_caddy() -> (reqwest::Client, String) {
    let app_config = config::AppConfig::default();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind random port");
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{addr}");

    let pool = db::init(":memory:").await.expect("in-memory DB");

    // Pre-seed the caddy_admin_url setting so the server talks to our Docker Caddy.
    sqlx::query("INSERT INTO settings (key, value) VALUES ('caddy_admin_url', ?)")
        .bind(CADDY_ADMIN_URL)
        .execute(&pool)
        .await
        .expect("seed caddy_admin_url");

    let state = api::AppState::new(pool, app_config);
    let app = api::router(state);

    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .expect("server error");
    });

    // Build a reqwest client with cookie store for sessions.
    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .expect("build reqwest client");

    // Run setup so we have an authenticated session.
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "caddy_test_password"}))
        .send()
        .await
        .expect("setup failed");
    assert_eq!(resp.status(), StatusCode::OK, "setup should succeed");

    // Reset Caddy config to a clean state before each test group.
    reset_caddy().await;

    (client, base_url)
}

/// Reset the Caddy config to a blank state (no routes).
async fn reset_caddy() {
    let http = reqwest::Client::new();
    // DELETE the whole config and re-seed with just the admin listener.
    let _ = http
        .delete(format!("{CADDY_ADMIN_URL}/config/apps"))
        .send()
        .await;
}

/// Helper: read the current Caddy HTTP config from the admin API.
async fn caddy_http_config() -> Option<Value> {
    let http = reqwest::Client::new();
    let resp = http
        .get(format!("{CADDY_ADMIN_URL}/config/apps/http"))
        .send()
        .await
        .ok()?;
    if resp.status().is_success() {
        resp.json::<Value>().await.ok()
    } else {
        None
    }
}

/// Check that `caddy_admin_url` is reachable — skip tests if Caddy isn't running.
async fn require_caddy() {
    let http = reqwest::Client::new();
    match http.get(format!("{CADDY_ADMIN_URL}/config/")).send().await {
        Ok(resp) if resp.status().is_success() => {}
        _ => panic!(
            "Caddy admin API not reachable at {CADDY_ADMIN_URL}. \
             Start with: docker run -d --name caddy-test -p 2019:2019 caddy:2-alpine"
        ),
    }
}

// ═══════════════════════════════════════════════════════════════
// 2.1 — Connection & Settings (C-01 .. C-03)
// ═══════════════════════════════════════════════════════════════

/// C-01: POST /api/v1/caddy/test-connection returns success when Caddy is reachable.
#[tokio::test]
async fn c01_test_connection_success() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .expect("test-connection request");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("json");
    assert_eq!(
        body["success"], true,
        "C-01: test-connection should succeed"
    );
    assert!(
        body["message"].as_str().unwrap().contains("Connected"),
        "C-01: message should say Connected"
    );
}

/// C-02: GET /api/v1/caddy/status returns reachable when Caddy is running.
#[tokio::test]
async fn c02_caddy_status_reachable() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .expect("status request");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("json");
    assert_eq!(body["configured"], true, "C-02: configured should be true");
    assert_eq!(body["reachable"], true, "C-02: reachable should be true");
}

/// C-03: Caddy status returns unreachable when the admin URL is wrong.
#[tokio::test]
async fn c03_caddy_status_unreachable() {
    require_caddy().await;
    // Spin up a server pointing at a non-existent Caddy admin URL.
    let app_config = config::AppConfig::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{addr}");
    let pool = db::init(":memory:").await.unwrap();

    // Point at a dead URL to simulate Caddy being down.
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('caddy_admin_url', 'http://127.0.0.1:29999')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let state = api::AppState::new(pool, app_config);
    let app = api::router(state);
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .unwrap();
    });

    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .unwrap();
    let resp = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&serde_json::json!({"password": "caddy_unreachable_pw"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let resp = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .expect("status request");
    assert_eq!(resp.status(), StatusCode::OK);

    let body: Value = resp.json().await.expect("json");
    assert_eq!(body["configured"], true, "C-03: configured should be true");
    assert_eq!(
        body["reachable"], false,
        "C-03: reachable should be false when Caddy is down"
    );
}

// ═══════════════════════════════════════════════════════════════
// 2.2 — Proxy Host Management (C-10 .. C-14)
// ═══════════════════════════════════════════════════════════════

/// C-10: GET /api/v1/caddy/proxy-hosts returns all hosts from SQLite.
#[tokio::test]
async fn c10_list_proxy_hosts_empty() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .expect("list request");
    assert_eq!(resp.status(), StatusCode::OK);

    let hosts: Vec<Value> = resp.json().await.expect("json");
    assert!(hosts.is_empty(), "C-10: should start with no proxy hosts");
}

/// C-11: POST creates a proxy host in SQLite AND syncs to Caddy.
#[tokio::test]
async fn c11_create_proxy_host_syncs_to_caddy() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "app.home.lan",
            "forward_host": "10.10.0.200",
            "forward_port": 80,
            "forward_scheme": "http",
            "tls_enabled": false
        }))
        .send()
        .await
        .expect("create request");
    assert_eq!(
        resp.status(),
        StatusCode::CREATED,
        "C-11: create should return 201"
    );

    let created: Value = resp.json().await.expect("json");
    assert_eq!(created["domain"], "app.home.lan");
    assert_eq!(created["forward_host"], "10.10.0.200");
    assert_eq!(created["forward_port"], 80);
    assert_eq!(created["enabled"], true);

    // Verify Caddy config now contains a route for app.home.lan.
    let cfg = caddy_http_config()
        .await
        .expect("Caddy config should exist");
    let routes = &cfg["servers"]["proxy"]["routes"];
    assert!(routes.is_array(), "C-11: Caddy should have routes");
    let routes_arr = routes.as_array().unwrap();
    assert_eq!(routes_arr.len(), 1, "C-11: exactly one route");

    let host_match = &routes_arr[0]["match"][0]["host"][0];
    assert_eq!(
        host_match, "app.home.lan",
        "C-11: route should match app.home.lan"
    );

    let dial = &routes_arr[0]["handle"][0]["upstreams"][0]["dial"];
    assert_eq!(
        dial, "10.10.0.200:80",
        "C-11: upstream should be 10.10.0.200:80"
    );
}

/// C-12: PUT updates a proxy host in SQLite AND resyncs Caddy.
#[tokio::test]
async fn c12_update_proxy_host_resyncs_caddy() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    // Create first.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "old.home.lan",
            "forward_host": "10.0.0.1",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.unwrap();
    let host_id = created["id"].as_str().unwrap();

    // Update to a different domain and upstream.
    let resp = client
        .put(format!("{base_url}/api/v1/caddy/proxy-hosts/{host_id}"))
        .json(&serde_json::json!({
            "domain": "new.home.lan",
            "forward_host": "10.0.0.2",
            "forward_port": 9090,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "C-12: update should return 200"
    );

    let updated: Value = resp.json().await.unwrap();
    assert_eq!(updated["domain"], "new.home.lan");
    assert_eq!(updated["forward_port"], 9090);

    // Verify Caddy config was resynced.
    let cfg = caddy_http_config().await.expect("Caddy config");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-12: still one route");
    assert_eq!(
        routes[0]["match"][0]["host"][0], "new.home.lan",
        "C-12: route should now match new.home.lan"
    );
    assert_eq!(
        routes[0]["handle"][0]["upstreams"][0]["dial"], "10.0.0.2:9090",
        "C-12: upstream should be updated"
    );
}

/// C-13: DELETE removes a proxy host from SQLite AND Caddy config.
#[tokio::test]
async fn c13_delete_proxy_host_removes_from_caddy() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    // Create.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "todelete.home.lan",
            "forward_host": "10.0.0.5",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.unwrap();
    let host_id = created["id"].as_str().unwrap();

    // Verify Caddy has the route.
    let cfg = caddy_http_config().await.expect("Caddy config");
    assert!(
        cfg["servers"]["proxy"]["routes"].as_array().unwrap().len() == 1,
        "C-13: Caddy should have one route before delete"
    );

    // Delete.
    let resp = client
        .delete(format!("{base_url}/api/v1/caddy/proxy-hosts/{host_id}"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::NO_CONTENT,
        "C-13: delete should return 204"
    );

    // Verify Caddy config has no routes (empty array).
    let cfg = caddy_http_config()
        .await
        .expect("Caddy config after delete");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert!(
        routes.is_empty(),
        "C-13: Caddy should have zero routes after delete"
    );
}

/// C-14: POST toggle enables/disables a host and Caddy config reflects the change.
#[tokio::test]
async fn c14_toggle_proxy_host_reflects_in_caddy() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    // Create (enabled by default).
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "toggle.home.lan",
            "forward_host": "10.0.0.8",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .unwrap();
    let created: Value = resp.json().await.unwrap();
    let host_id = created["id"].as_str().unwrap();
    assert_eq!(created["enabled"], true);

    // Caddy should have one route.
    let cfg = caddy_http_config().await.expect("Caddy config");
    assert_eq!(
        cfg["servers"]["proxy"]["routes"].as_array().unwrap().len(),
        1,
        "C-14: one route while enabled"
    );

    // Disable the host.
    let resp = client
        .post(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{host_id}/toggle"
        ))
        .json(&serde_json::json!({"enabled": false}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let toggled: Value = resp.json().await.unwrap();
    assert_eq!(toggled["enabled"], false, "C-14: host should be disabled");

    // Caddy routes should be empty (disabled hosts are excluded from config).
    let cfg = caddy_http_config()
        .await
        .expect("Caddy config after disable");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert!(
        routes.is_empty(),
        "C-14: Caddy should have zero routes when host is disabled"
    );

    // Re-enable.
    let resp = client
        .post(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{host_id}/toggle"
        ))
        .json(&serde_json::json!({"enabled": true}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Caddy should have the route back.
    let cfg = caddy_http_config()
        .await
        .expect("Caddy config after re-enable");
    assert_eq!(
        cfg["servers"]["proxy"]["routes"].as_array().unwrap().len(),
        1,
        "C-14: route should reappear after re-enable"
    );
}

// ═══════════════════════════════════════════════════════════════
// 2.3 — TLS & Sync (C-20 .. C-24)
// ═══════════════════════════════════════════════════════════════

/// C-20: POST /api/v1/caddy/sync forces a full sync from SQLite to Caddy.
#[tokio::test]
async fn c20_force_sync_pushes_state() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    // Create a host (which auto-syncs).
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "sync.home.lan",
            "forward_host": "10.0.0.20",
            "forward_port": 80,
            "forward_scheme": "http"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Reset Caddy to blank — simulate config drift.
    reset_caddy().await;

    // Verify Caddy has no routes after reset.
    let cfg = caddy_http_config().await;
    assert!(
        cfg.is_none() || cfg.as_ref().unwrap().get("servers").is_none(),
        "C-20: Caddy should have no HTTP config after reset"
    );

    // Force sync.
    let resp = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        StatusCode::NO_CONTENT,
        "C-20: sync should return 204"
    );

    // Caddy should now have the route restored.
    let cfg = caddy_http_config().await.expect("Caddy config after sync");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-20: one route after force sync");
    assert_eq!(
        routes[0]["match"][0]["host"][0], "sync.home.lan",
        "C-20: route should be for sync.home.lan"
    );
}

/// C-21: TLS-enabled proxy host includes the domain for Caddy auto-TLS.
#[tokio::test]
async fn c21_tls_enabled_proxy_host() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "secure.home.lan",
            "forward_host": "10.0.0.30",
            "forward_port": 443,
            "forward_scheme": "http",
            "tls_enabled": true
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let created: Value = resp.json().await.unwrap();
    assert_eq!(
        created["tls_enabled"], true,
        "C-21: tls_enabled should be true"
    );

    // Caddy should have the route with the domain matcher.
    // When tls_enabled is true and the domain is in a host matcher,
    // Caddy's automatic HTTPS will attempt cert provisioning.
    let cfg = caddy_http_config().await.expect("Caddy config");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-21: one route");
    assert_eq!(
        routes[0]["match"][0]["host"][0], "secure.home.lan",
        "C-21: domain matcher should be present for TLS"
    );

    // The server listens on :443 which enables auto-HTTPS for matched domains.
    let listen = cfg["servers"]["proxy"]["listen"].as_array().unwrap();
    assert!(
        listen.iter().any(|l| l.as_str() == Some(":443")),
        "C-21: server should listen on :443 for TLS"
    );
}

/// C-22: HTTP-only proxy host (tls_enabled=false) still creates a valid route.
#[tokio::test]
async fn c22_http_only_proxy_host() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "plain.home.lan",
            "forward_host": "10.0.0.40",
            "forward_port": 80,
            "forward_scheme": "http",
            "tls_enabled": false
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let created: Value = resp.json().await.unwrap();
    assert_eq!(
        created["tls_enabled"], false,
        "C-22: tls_enabled should be false"
    );

    // Route should exist in Caddy.
    let cfg = caddy_http_config().await.expect("Caddy config");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-22: one route");
    assert_eq!(
        routes[0]["match"][0]["host"][0], "plain.home.lan",
        "C-22: route domain"
    );
    assert_eq!(
        routes[0]["handle"][0]["upstreams"][0]["dial"], "10.0.0.40:80",
        "C-22: plain HTTP upstream"
    );
}

/// C-23: HTTPS upstream — forward_scheme=https sets transport TLS on the upstream.
#[tokio::test]
async fn c23_https_upstream() {
    require_caddy().await;
    let (client, base_url) = spawn_with_caddy().await;

    let resp = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&serde_json::json!({
            "domain": "upstream-tls.home.lan",
            "forward_host": "10.0.0.50",
            "forward_port": 443,
            "forward_scheme": "https",
            "tls_enabled": false
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Verify Caddy config has the transport TLS settings.
    let cfg = caddy_http_config().await.expect("Caddy config");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-23: one route");

    let handler = &routes[0]["handle"][0];
    assert_eq!(
        handler["upstreams"][0]["dial"], "10.0.0.50:443",
        "C-23: upstream should be TLS"
    );

    // Check that transport.tls is set for HTTPS upstream.
    assert!(
        handler.get("transport").is_some(),
        "C-23: transport should be present for HTTPS upstream"
    );
    assert_eq!(
        handler["transport"]["protocol"], "http",
        "C-23: transport protocol should be http (Caddy's way of saying HTTP-over-TLS)"
    );
    assert!(
        handler["transport"]["tls"].is_object(),
        "C-23: transport.tls should be set"
    );
}

/// C-24: Startup sync — a fresh server pushes SQLite state to Caddy after a delay.
#[tokio::test]
async fn c24_startup_sync() {
    require_caddy().await;
    reset_caddy().await;

    let app_config = config::AppConfig::default();
    let pool = db::init(":memory:").await.unwrap();

    // Seed caddy_admin_url.
    sqlx::query("INSERT INTO settings (key, value) VALUES ('caddy_admin_url', ?)")
        .bind(CADDY_ADMIN_URL)
        .execute(&pool)
        .await
        .unwrap();

    // Also seed a setup_complete + password so the server is usable.
    sqlx::query("INSERT INTO settings (key, value) VALUES ('setup_complete', 'true')")
        .execute(&pool)
        .await
        .unwrap();

    // Insert a proxy host directly into the DB (simulating existing state).
    sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, forward_host, forward_port, forward_scheme, enabled) \
         VALUES ('startup-sync-id', 'startup.home.lan', '10.0.0.99', 80, 'http', 1)",
    )
    .execute(&pool)
    .await
    .unwrap();

    // Build the state and fire the startup sync task (without starting the server).
    let state = api::AppState::new(pool, app_config);
    api::caddy::start_caddy_sync_task(state);

    // The sync task waits 5 seconds, so we wait 7 to be safe.
    tokio::time::sleep(std::time::Duration::from_secs(7)).await;

    // Verify Caddy now has the route from the pre-existing DB data.
    let cfg = caddy_http_config()
        .await
        .expect("Caddy config after startup sync");
    let routes = cfg["servers"]["proxy"]["routes"].as_array().unwrap();
    assert_eq!(routes.len(), 1, "C-24: one route after startup sync");
    assert_eq!(
        routes[0]["match"][0]["host"][0], "startup.home.lan",
        "C-24: route should match the pre-existing DB host"
    );
    assert_eq!(
        routes[0]["handle"][0]["upstreams"][0]["dial"], "10.0.0.99:80",
        "C-24: upstream should match DB"
    );
}
