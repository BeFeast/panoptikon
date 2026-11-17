//! Caddy integration tests (C-01 .. C-38).
//!
//! The suite requires Caddy 2.11.x with `dns.providers.cloudflare`, listening
//! on the loopback admin address. Forgejo CI starts that exact build. Run these
//! tests sequentially because every case owns the same Caddy process:
//! `cargo test --test caddy_integration -- --test-threads=1`.

use std::{net::SocketAddr, time::Duration};

use panoptikon_server::{api, config, db};
use reqwest::StatusCode;
use serde_json::{json, Value};
use sqlx::SqlitePool;

const CADDY_ADMIN_URL: &str = "http://127.0.0.1:2019";
const SEED_DOCUMENT: &str = r#"{"admin":{"listen":"127.0.0.1:2019"},"apps":{"http":{"servers":{"legacy":{"listen":[":8099"],"automatic_https":{"disable":true},"routes":[{"handle":[{"handler":"static_response","body":"legacy"}]}]}}}}}"#;

// ─── Helpers ────────────────────────────────────────────────

async fn seed_managed_settings(pool: &SqlitePool) {
    let hash = bcrypt::hash("ci-secret", 4).expect("bcrypt hash");
    let settings = [
        ("caddy_managed", "true".to_string()),
        ("caddy_admin_url", CADDY_ADMIN_URL.to_string()),
        ("caddy_admin_user", "panoptikon-ci".to_string()),
        ("caddy_admin_password", "ci-secret".to_string()),
        ("caddy_admin_password_hash", hash),
        ("caddy_admin_listen", "127.0.0.1:2019".to_string()),
        ("caddy_lan_ip", "127.0.0.1".to_string()),
        ("caddy_admin_resolve_ip", "127.0.0.1".to_string()),
        ("caddy_admin_gate_port", "2029".to_string()),
        ("caddy_admin_allowed_ranges", "127.0.0.1/32".to_string()),
        ("caddy_acme_email", "ci@example.test".to_string()),
        ("caddy_acme_ca", "https://127.0.0.1:9/directory".to_string()),
        ("caddy_dns_provider", "cloudflare".to_string()),
        ("caddy_dns_token_env", "CLOUDFLARE_API_TOKEN".to_string()),
        ("caddy_dns_resolvers", "1.1.1.1:53,8.8.8.8:53".to_string()),
        ("caddy_dns_propagation_delay", "20s".to_string()),
    ];
    for (key, value) in settings {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .expect("seed managed Caddy setting");
    }
}

async fn patch_setting(pool: &SqlitePool, key: &str, value: &str) {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .unwrap();
}

async fn spawn(pool: SqlitePool) -> (reqwest::Client, String) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind random port");
    let base_url = format!("http://{}", listener.local_addr().unwrap());
    let state = api::AppState::new(pool, config::AppConfig::default());
    let app = api::router(state);
    tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .await
        .expect("server error");
    });

    let client = reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .expect("session client");
    let response = client
        .post(format!("{base_url}/api/v1/setup"))
        .json(&json!({"password": "caddy_test_password"}))
        .send()
        .await
        .expect("setup request");
    assert_eq!(response.status(), StatusCode::OK);
    (client, base_url)
}

async fn spawn_with_caddy() -> (reqwest::Client, String, SqlitePool) {
    require_caddy().await;
    reset_caddy().await;
    let pool = db::init(":memory:").await.expect("in-memory DB");
    seed_managed_settings(&pool).await;
    let (client, base_url) = spawn(pool.clone()).await;
    (client, base_url, pool)
}

async fn reset_caddy() {
    let response = reqwest::Client::new()
        .post(format!("{CADDY_ADMIN_URL}/load"))
        .header("Content-Type", "application/json")
        .body(SEED_DOCUMENT)
        .send()
        .await
        .expect("reset Caddy request");
    assert!(
        response.status().is_success(),
        "reset Caddy failed: {}",
        response.text().await.unwrap_or_default()
    );
}

async fn caddy_full_config() -> Value {
    reqwest::Client::new()
        .get(format!("{CADDY_ADMIN_URL}/config/"))
        .send()
        .await
        .expect("read Caddy config")
        .error_for_status()
        .expect("Caddy config status")
        .json()
        .await
        .expect("Caddy config JSON")
}

async fn caddy_http_config() -> Value {
    caddy_full_config().await["apps"]["http"].clone()
}

fn server_routes<'a>(config: &'a Value, server: &str) -> &'a [Value] {
    config["servers"][server]["routes"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn route_domains<'a>(config: &'a Value, server: &str) -> Vec<&'a str> {
    server_routes(config, server)
        .iter()
        .filter_map(|route| route["match"][0]["host"][0].as_str())
        .collect()
}

async fn create_host(
    client: &reqwest::Client,
    base_url: &str,
    domain: &str,
    tls_enabled: bool,
) -> Value {
    let response = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&json!({
            "domain": domain,
            "forward_host": "10.10.0.200",
            "forward_port": 8080,
            "forward_scheme": "http",
            "tls_enabled": tls_enabled
        }))
        .send()
        .await
        .expect("create host");
    assert_eq!(response.status(), StatusCode::CREATED);
    response.json().await.unwrap()
}

async fn require_caddy() {
    match reqwest::Client::new()
        .get(format!("{CADDY_ADMIN_URL}/config/"))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {}
        _ => panic!(
            "Caddy admin API is not reachable at {CADDY_ADMIN_URL}; run the pinned cloudflare build"
        ),
    }
}

// ─── Connection and existing CRUD contract (C-01 .. C-24) ─

#[tokio::test]
async fn c01_test_connection_success() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let body: Value = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["success"], true);
    assert!(body["message"].as_str().unwrap().contains("Connected"));
}

#[tokio::test]
async fn c02_caddy_status_reachable() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let body: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["configured"], true);
    assert_eq!(body["managed"], true);
    assert_eq!(body["reachable"], true);
    assert_eq!(body["auth_enabled"], true);
}

#[tokio::test]
async fn c03_caddy_status_unreachable() {
    let pool = db::init(":memory:").await.unwrap();
    seed_managed_settings(&pool).await;
    patch_setting(&pool, "caddy_admin_url", "http://127.0.0.1:29999").await;
    patch_setting(&pool, "caddy_admin_resolve_ip", "").await;
    let (client, base_url) = spawn(pool).await;
    let body: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["reachable"], false);
}

#[tokio::test]
async fn c10_list_proxy_hosts_empty() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let hosts: Vec<Value> = client
        .get(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(hosts.is_empty());
}

#[tokio::test]
async fn c11_create_proxy_host_syncs_to_http_server() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "app.home.lan", false).await;
    let config = caddy_http_config().await;
    assert_eq!(route_domains(&config, "http"), ["app.home.lan"]);
    assert_eq!(
        server_routes(&config, "http")[0]["handle"][0]["upstreams"][0]["dial"],
        "10.10.0.200:8080"
    );
}

#[tokio::test]
async fn c12_update_proxy_host_resyncs_caddy() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let created = create_host(&client, &base_url, "old.home.lan", false).await;
    let response = client
        .put(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{}",
            created["id"].as_str().unwrap()
        ))
        .json(&json!({
            "domain": "new.home.lan",
            "forward_host": "10.0.0.2",
            "forward_port": 9090,
            "forward_scheme": "http",
            "tls_enabled": false
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let config = caddy_http_config().await;
    assert_eq!(route_domains(&config, "http"), ["new.home.lan"]);
}

#[tokio::test]
async fn c13_delete_proxy_host_removes_route() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let created = create_host(&client, &base_url, "delete.home.lan", false).await;
    let response = client
        .delete(format!(
            "{base_url}/api/v1/caddy/proxy-hosts/{}",
            created["id"].as_str().unwrap()
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(server_routes(&caddy_http_config().await, "http").is_empty());
}

#[tokio::test]
async fn c14_toggle_proxy_host_reflects_in_caddy() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let created = create_host(&client, &base_url, "toggle.home.lan", false).await;
    let id = created["id"].as_str().unwrap();
    let response = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts/{id}/toggle"))
        .json(&json!({"enabled": false}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(server_routes(&caddy_http_config().await, "http").is_empty());
    client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts/{id}/toggle"))
        .json(&json!({"enabled": true}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["toggle.home.lan"]
    );
}

#[tokio::test]
async fn c20_explicit_sync_restores_drift() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "sync.home.lan", false).await;
    reset_caddy().await;
    let response = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["sync.home.lan"]
    );
}

#[tokio::test]
async fn c21_tls_host_uses_https_server() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "secure.example.test", true).await;
    let config = caddy_http_config().await;
    assert_eq!(route_domains(&config, "https"), ["secure.example.test"]);
    assert_eq!(config["servers"]["https"]["listen"], json!([":443"]));
}

#[tokio::test]
async fn c22_http_only_host_disables_automatic_https() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "plain.home.lan", false).await;
    let config = caddy_http_config().await;
    assert_eq!(route_domains(&config, "http"), ["plain.home.lan"]);
    assert_eq!(
        config["servers"]["http"]["automatic_https"]["disable"],
        true
    );
}

#[tokio::test]
async fn c23_https_upstream_sets_tls_transport() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let response = client
        .post(format!("{base_url}/api/v1/caddy/proxy-hosts"))
        .json(&json!({
            "domain": "upstream.home.lan",
            "forward_host": "10.0.0.50",
            "forward_port": 443,
            "forward_scheme": "https",
            "tls_enabled": false
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    let config = caddy_http_config().await;
    assert_eq!(
        server_routes(&config, "http")[0]["handle"][0]["transport"],
        json!({"protocol": "http", "tls": {}})
    );
}

#[tokio::test]
async fn c24_startup_sync_pushes_when_managed() {
    require_caddy().await;
    reset_caddy().await;
    let pool = db::init(":memory:").await.unwrap();
    seed_managed_settings(&pool).await;
    sqlx::query(
        "INSERT INTO caddy_proxy_hosts \
         (id, domain, forward_host, forward_port, forward_scheme, enabled, tls_enabled) \
         VALUES ('startup-id', 'startup.home.lan', '10.0.0.99', 80, 'http', 1, 0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    api::caddy::start_caddy_sync_task(api::AppState::new(pool, config::AppConfig::default()));
    tokio::time::sleep(Duration::from_secs(7)).await;
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["startup.home.lan"]
    );
}

// ─── Production hardening (C-25 .. C-38) ───────────────────

#[tokio::test]
async fn c25_load_replaces_full_config() {
    let (client, base_url, _) = spawn_with_caddy().await;
    assert!(caddy_http_config().await["servers"]["legacy"].is_object());
    create_host(&client, &base_url, "atomic.home.lan", false).await;
    let config = caddy_full_config().await;
    assert_eq!(config["admin"]["listen"], "127.0.0.1:2019");
    let origins = config["admin"]["origins"].as_array().unwrap();
    for expected in [
        "127.0.0.1:2019",
        "localhost:2019",
        "[::1]:2019",
        "127.0.0.1:2029",
    ] {
        assert!(origins.iter().any(|value| value == expected));
    }
    let servers = &config["apps"]["http"]["servers"];
    assert!(servers["https"].is_object());
    assert!(servers["http"].is_object());
    assert!(servers["admin_gate"].is_object());
    assert!(servers.get("legacy").is_none());
}

#[tokio::test]
async fn c26_rejected_load_keeps_previous_config() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "preserved.home.lan", false).await;
    let response = client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({"caddy_admin_listen": "not::an::address"}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({"confirm_gate_change": true}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["ok"], false);
    assert!(body["error"].as_str().unwrap().contains("HTTP 400"));
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["preserved.home.lan"]
    );
    let status: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["last_sync_ok"], false);
    assert!(status["last_sync_at"].is_string());
    assert!(status["last_sync_error"]
        .as_str()
        .unwrap()
        .contains("admin"));
}

#[tokio::test]
async fn c27_admin_gate_survives_push() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "gate.home.lan", false).await;
    let with_auth = reqwest::Client::new()
        .get("http://127.0.0.1:2029/config/")
        .basic_auth("panoptikon-ci", Some("ci-secret"))
        .send()
        .await
        .unwrap();
    assert_eq!(with_auth.status(), StatusCode::OK);
    let without_auth = reqwest::Client::new()
        .get("http://127.0.0.1:2029/config/")
        .send()
        .await
        .unwrap();
    assert_eq!(without_auth.status(), StatusCode::UNAUTHORIZED);

    let config = caddy_full_config().await;
    let gate = &config["apps"]["http"]["servers"]["admin_gate"];
    assert_eq!(
        gate["routes"][0]["match"][0]["remote_ip"]["ranges"],
        json!(["127.0.0.1/32"])
    );
    assert_eq!(
        gate["routes"][0]["handle"][0]["providers"]["http_basic"]["hash"]["algorithm"],
        "bcrypt"
    );
    assert_eq!(
        gate["routes"][0]["handle"][1]["headers"]["request"]["set"]["Host"],
        json!(["127.0.0.1:2019"])
    );
}

#[tokio::test]
async fn c28_http_only_hosts_get_no_tls_policy() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "plain.ok", false).await;
    let config = caddy_full_config().await;
    assert!(config["apps"].get("tls").is_none());
    assert_eq!(route_domains(&config["apps"]["http"], "http"), ["plain.ok"]);
    assert!(server_routes(&config["apps"]["http"], "https").is_empty());
}

#[tokio::test]
async fn c29_tls_hosts_derive_wildcard_policy() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "git.example.test", true).await;
    create_host(&client, &base_url, "a.b.example.test", true).await;
    create_host(&client, &base_url, "plain.ok", false).await;
    let config = caddy_full_config().await;
    let subjects = json!(["*.b.example.test", "*.example.test"]);
    assert_eq!(config["apps"]["tls"]["certificates"]["automate"], subjects);
    assert_eq!(
        config["apps"]["tls"]["automation"]["policies"][0]["subjects"],
        subjects
    );
    let issuer = &config["apps"]["tls"]["automation"]["policies"][0]["issuers"][0];
    assert_eq!(issuer["ca"], "https://127.0.0.1:9/directory");
    assert_eq!(
        issuer["challenges"]["dns"]["provider"],
        json!({"name": "cloudflare", "api_token": "{env.CLOUDFLARE_API_TOKEN}"})
    );
    assert_eq!(issuer["challenges"]["dns"]["propagation_timeout"], -1);
    assert_eq!(route_domains(&config["apps"]["http"], "http"), ["plain.ok"]);
}

#[tokio::test]
async fn c30_unmanaged_never_connects() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let pool = db::init(":memory:").await.unwrap();
    patch_setting(
        &pool,
        "caddy_admin_url",
        &format!("http://127.0.0.1:{port}"),
    )
    .await;
    let (client, base_url) = spawn(pool).await;
    create_host(&client, &base_url, "unmanaged.home.lan", false).await;
    let sync: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sync["skipped"], true);
    let status: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["managed"], false);
    assert!(status["last_sync_at"].is_null());
    assert!(
        tokio::time::timeout(Duration::from_millis(500), listener.accept())
            .await
            .is_err(),
        "unmanaged Caddy attempted a TCP connection"
    );
}

#[tokio::test]
async fn c31_basic_auth_on_admin_requests() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "auth.home.lan", false).await;
    client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({
            "caddy_admin_url": "http://127.0.0.1:2029",
            "caddy_admin_resolve_ip": ""
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let good: Value = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(good["success"], true);

    // Password changes do not push automatically, so the gate still holds the
    // old hash while Panoptikon intentionally tries the new, wrong credential.
    client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({"caddy_admin_password": "wrong"}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let bad: Value = client
        .post(format!("{base_url}/api/v1/caddy/test-connection"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(bad["success"], false);
    assert!(bad["message"].as_str().unwrap().contains("401"));
}

#[tokio::test]
async fn c32_missing_gate_settings_refuse_push_and_preview() {
    require_caddy().await;
    reset_caddy().await;
    let before = caddy_full_config().await;
    let pool = db::init(":memory:").await.unwrap();
    seed_managed_settings(&pool).await;
    sqlx::query("DELETE FROM settings WHERE key = 'caddy_admin_allowed_ranges'")
        .execute(&pool)
        .await
        .unwrap();
    let (client, base_url) = spawn(pool).await;
    let sync: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sync["ok"], false);
    assert!(sync["error"]
        .as_str()
        .unwrap()
        .contains("caddy_admin_allowed_ranges"));
    assert_eq!(caddy_full_config().await, before);

    client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({"caddy_managed": false}))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let preview = client
        .get(format!("{base_url}/api/v1/caddy/config"))
        .send()
        .await
        .unwrap();
    assert_eq!(preview.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(preview
        .text()
        .await
        .unwrap()
        .contains("caddy_admin_allowed_ranges"));
}

#[tokio::test]
async fn c33_startup_sync_respects_managed_flag() {
    require_caddy().await;
    reset_caddy().await;
    let pool = db::init(":memory:").await.unwrap();
    sqlx::query(
        "INSERT INTO caddy_proxy_hosts \
         (id, domain, forward_host, forward_port, forward_scheme, enabled, tls_enabled) \
         VALUES ('off-id', 'off.home.lan', '10.0.0.1', 80, 'http', 1, 0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    api::caddy::start_caddy_sync_task(api::AppState::new(pool, config::AppConfig::default()));
    tokio::time::sleep(Duration::from_secs(7)).await;
    assert!(caddy_http_config().await["servers"]["legacy"].is_object());

    let pool = db::init(":memory:").await.unwrap();
    seed_managed_settings(&pool).await;
    sqlx::query(
        "INSERT INTO caddy_proxy_hosts \
         (id, domain, forward_host, forward_port, forward_scheme, enabled, tls_enabled) \
         VALUES ('on-id', 'on.home.lan', '10.0.0.1', 80, 'http', 1, 0)",
    )
    .execute(&pool)
    .await
    .unwrap();
    api::caddy::start_caddy_sync_task(api::AppState::new(pool, config::AppConfig::default()));
    tokio::time::sleep(Duration::from_secs(7)).await;
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["on.home.lan"]
    );
}

#[tokio::test]
async fn c34_settings_roundtrip_hides_password_and_rejects_atomically() {
    let (client, base_url, _) = spawn_with_caddy().await;
    let response = client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({
            "caddy_managed": false,
            "caddy_admin_url": "https://caddy-admin.oklabs.uk:2019",
            "caddy_admin_user": "operator",
            "caddy_admin_password": "secret-value",
            "caddy_admin_listen": "127.0.0.1:2019",
            "caddy_lan_ip": "10.10.0.32",
            "caddy_admin_resolve_ip": "10.10.0.32",
            "caddy_admin_gate_port": 2019,
            "caddy_admin_allowed_ranges": "10.10.0.22/32,127.0.0.1/32",
            "caddy_acme_email": "ops@example.test",
            "caddy_acme_ca": "",
            "caddy_acme_zones": "oklabs.uk",
            "caddy_dns_provider": "cloudflare",
            "caddy_dns_token_env": "CLOUDFLARE_API_TOKEN",
            "caddy_dns_token_placeholder": "{file./etc/caddy/cf_token}",
            "caddy_dns_resolvers": "1.1.1.1:53,8.8.8.8:53",
            "caddy_dns_propagation_delay": "20s"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["caddy_admin_user"], "operator");
    assert_eq!(body["caddy_admin_password_set"], true);
    assert_eq!(
        body["caddy_dns_token_placeholder"],
        "{file./etc/caddy/cf_token}"
    );
    assert!(body.get("caddy_admin_password").is_none());
    assert!(body.get("caddy_admin_password_hash").is_none());
    assert!(body.get("caddy_gate_fingerprint").is_none());

    for invalid in [
        json!({"caddy_dns_provider": "route53"}),
        json!({"caddy_dns_token_env": "bad-name"}),
        json!({"caddy_admin_allowed_ranges": "not-a-cidr"}),
        json!({"caddy_lan_ip": "nope"}),
        json!({"caddy_admin_gate_port": 0}),
        json!({"caddy_admin_gate_port": 70000}),
    ] {
        let response = client
            .patch(format!("{base_url}/api/v1/settings"))
            .json(&invalid)
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: Value = response.json().await.unwrap();
        assert_eq!(body["code"], "validation_error");
    }

    let response = client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({
            "webhook_url": "https://should-not-persist.invalid",
            "caddy_lan_ip": "invalid"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let settings: Value = client
        .get(format!("{base_url}/api/v1/settings"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_ne!(
        settings["webhook_url"],
        "https://should-not-persist.invalid"
    );
}

#[tokio::test]
async fn c35_config_preview_matches_pushed_and_is_deterministic() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "preview.example.test", true).await;
    let first = client
        .get(format!("{base_url}/api/v1/caddy/config"))
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    let second = client
        .get(format!("{base_url}/api/v1/caddy/config"))
        .send()
        .await
        .unwrap()
        .bytes()
        .await
        .unwrap();
    assert_eq!(first, second);
    let preview: Value = serde_json::from_slice(&first).unwrap();
    let pushed = caddy_full_config().await;
    assert_eq!(preview["admin"], pushed["admin"]);
    assert_eq!(
        preview["apps"]["http"]["servers"]["admin_gate"],
        pushed["apps"]["http"]["servers"]["admin_gate"]
    );
    assert!(String::from_utf8_lossy(&first).contains("{env.CLOUDFLARE_API_TOKEN}"));
    let second_sync: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(second_sync["ok"], true);
}

#[tokio::test]
async fn c36_gate_change_requires_confirmation() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "first.home.lan", false).await;
    client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({
            "caddy_admin_allowed_ranges": "127.0.0.1/32,10.0.0.0/8"
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    create_host(&client, &base_url, "pending.home.lan", false).await;
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["first.home.lan"]
    );
    let status: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["gate_change_pending"], true);
    let refused: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(refused["gate_change_pending"], true);
    let confirmed: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({"confirm_gate_change": true}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(confirmed["ok"], true);
    assert_eq!(
        route_domains(&caddy_http_config().await, "http"),
        ["first.home.lan", "pending.home.lan"]
    );
}

#[tokio::test]
async fn c37_post_push_probe_reports_lockout() {
    let (client, base_url, _) = spawn_with_caddy().await;
    create_host(&client, &base_url, "lockout.home.lan", false).await;
    client
        .patch(format!("{base_url}/api/v1/settings"))
        .json(&json!({
            "caddy_admin_url": "http://127.0.0.1:2029",
            "caddy_admin_resolve_ip": "",
            "caddy_admin_allowed_ranges": "10.255.255.1/32"
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap();
    let sync: Value = client
        .post(format!("{base_url}/api/v1/caddy/sync"))
        .json(&json!({"confirm_gate_change": true}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(sync["ok"], false);
    assert_eq!(sync["locked_out"], true);
    assert!(sync["error"].as_str().unwrap().contains("admin gate"));
    let status: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["last_sync_locked_out"], true);
    reset_caddy().await;
}

#[tokio::test]
async fn c38_crud_returns_2xx_when_push_fails_and_wizard_reports_it() {
    let pool = db::init(":memory:").await.unwrap();
    seed_managed_settings(&pool).await;
    patch_setting(&pool, "caddy_admin_url", "http://127.0.0.1:29999").await;
    patch_setting(&pool, "caddy_admin_resolve_ip", "").await;
    let (client, base_url) = spawn(pool).await;
    let created = create_host(&client, &base_url, "durable.home.lan", false).await;
    let id = created["id"].as_str().unwrap();
    assert_eq!(
        client
            .post(format!("{base_url}/api/v1/caddy/proxy-hosts/{id}/toggle"))
            .json(&json!({"enabled": false}))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        client
            .delete(format!("{base_url}/api/v1/caddy/proxy-hosts/{id}"))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NO_CONTENT
    );
    let status: Value = client
        .get(format!("{base_url}/api/v1/caddy/status"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status["last_sync_ok"], false);

    let wizard: Value = client
        .post(format!("{base_url}/api/v1/services/add"))
        .json(&json!({
            "name": "Durable wizard",
            "internal_ip": "10.0.0.9",
            "internal_port": 8080,
            "forward_scheme": "http",
            "domain": "wizard.home.lan",
            "tls_enabled": false,
            "create_port_forward": false
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let steps = wizard["steps"].as_array().unwrap();
    assert_eq!(steps[0]["step"], "caddy_proxy_host");
    assert_eq!(steps[0]["success"], true);
    assert_eq!(steps[1]["step"], "caddy_sync");
    assert_eq!(steps[1]["success"], false);
}
