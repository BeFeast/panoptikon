use std::fmt;
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use reqwest::{Method, RequestBuilder};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tracing::{error, info};

use super::{AppError, AppState};
use crate::caddy::{build_caddy_config, CaddyConfigInput, ProxyHostRow};

const LOCKOUT_MESSAGE: &str = "config loaded but the admin gate is no longer reachable from Panoptikon — recover on the Caddy host via 127.0.0.1:2019 (see docs/caddy-production.md#recovery)";

#[derive(Debug, Serialize)]
pub struct CaddyProxyHost {
    pub id: String,
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub tls_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CaddyProxyHostRequest {
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,
    #[serde(default)]
    pub tls_enabled: bool,
}

fn default_scheme() -> String {
    "http".to_string()
}

#[derive(Debug, Clone, Default)]
pub struct CaddySyncState {
    pub last_ok: Option<bool>,
    pub last_at: Option<String>,
    pub last_error: Option<String>,
    pub last_route_count: Option<usize>,
    pub locked_out: bool,
    pub gate_change_pending: bool,
}

#[derive(Debug, Serialize)]
pub struct CaddyStatus {
    pub configured: bool,
    pub reachable: bool,
    pub managed: bool,
    pub auth_enabled: bool,
    pub gate_change_pending: bool,
    pub last_sync_ok: Option<bool>,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
    pub last_sync_route_count: Option<usize>,
    pub last_sync_locked_out: bool,
}

#[derive(Debug, Serialize)]
pub struct TestConnectionResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SyncOptions {
    #[serde(default)]
    pub confirm_gate_change: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncReport {
    pub skipped: bool,
    pub route_count: usize,
    pub tls_subjects: Vec<String>,
}

#[derive(Debug)]
pub enum SyncError {
    Config(String),
    GateChangePending,
    Http { status: u16, body: String },
    Transport(String),
    LockedOut(String),
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(message) | Self::Transport(message) | Self::LockedOut(message) => {
                f.write_str(message)
            }
            Self::GateChangePending => {
                f.write_str("admin gate settings changed since last sync; run an explicit sync")
            }
            Self::Http { status, body } => {
                write!(f, "Caddy rejected the config (HTTP {status}): {body}")
            }
        }
    }
}

impl std::error::Error for SyncError {}

#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub ok: bool,
    pub skipped: bool,
    pub route_count: usize,
    pub error: Option<String>,
    pub gate_change_pending: bool,
    pub locked_out: bool,
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|value| !value.is_empty())
}

async fn required_setting(state: &AppState, key: &str) -> String {
    get_setting(state, key).await.unwrap_or_default()
}

fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

async fn caddy_managed(state: &AppState) -> bool {
    get_setting(state, "caddy_managed")
        .await
        .is_some_and(|value| value == "true" || value == "1")
}

#[derive(Debug, Clone)]
struct AdminAccess {
    url: String,
    user: String,
    password: String,
    resolve_ip: Option<IpAddr>,
}

impl AdminAccess {
    fn request(
        &self,
        state: &AppState,
        method: Method,
        path: &str,
    ) -> Result<RequestBuilder, SyncError> {
        let parsed = reqwest::Url::parse(&self.url)
            .map_err(|error| SyncError::Config(format!("invalid caddy_admin_url: {error}")))?;
        let host = parsed
            .host_str()
            .ok_or_else(|| SyncError::Config("caddy_admin_url has no host".to_string()))?;

        let client = if host.parse::<IpAddr>().is_err() {
            if let Some(ip) = self.resolve_ip {
                let port = parsed.port_or_known_default().ok_or_else(|| {
                    SyncError::Config("caddy_admin_url must include a port".to_string())
                })?;
                reqwest::Client::builder()
                    .timeout(Duration::from_secs(10))
                    .resolve(host, SocketAddr::new(ip, port))
                    .build()
                    .map_err(|error| SyncError::Transport(error.to_string()))?
            } else {
                state.caddy_http.clone()
            }
        } else {
            state.caddy_http.clone()
        };

        let url = format!("{}{}", self.url.trim_end_matches('/'), path);
        let mut request = client.request(method, url);
        if !self.user.is_empty() {
            request = request.basic_auth(&self.user, Some(&self.password));
        }
        Ok(request)
    }
}

async fn load_admin_access(state: &AppState) -> AdminAccess {
    let configured_resolve_ip = get_setting(state, "caddy_admin_resolve_ip").await;
    let fallback_lan_ip = if configured_resolve_ip.is_none() {
        get_setting(state, "caddy_lan_ip").await
    } else {
        None
    };
    AdminAccess {
        url: get_setting(state, "caddy_admin_url")
            .await
            .unwrap_or_else(|| "http://localhost:2019".to_string()),
        user: required_setting(state, "caddy_admin_user").await,
        password: required_setting(state, "caddy_admin_password").await,
        resolve_ip: configured_resolve_ip
            .or(fallback_lan_ip)
            .and_then(|value| value.parse().ok()),
    }
}

async fn load_config_input(state: &AppState) -> Result<CaddyConfigInput, SyncError> {
    let rows: Vec<(String, String, i64, String, i64)> = sqlx::query_as(
        "SELECT domain, forward_host, forward_port, forward_scheme, tls_enabled \
         FROM caddy_proxy_hosts WHERE enabled = 1 ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|error| SyncError::Config(format!("failed to load Caddy proxy hosts: {error}")))?;

    let hosts = rows
        .into_iter()
        .map(
            |(domain, forward_host, forward_port, forward_scheme, tls_enabled)| ProxyHostRow {
                domain,
                forward_host,
                forward_port: u16::try_from(forward_port).unwrap_or_default(),
                forward_scheme,
                tls_enabled: tls_enabled != 0,
            },
        )
        .collect();
    let token_env = get_setting(state, "caddy_dns_token_env")
        .await
        .unwrap_or_else(|| "CLOUDFLARE_API_TOKEN".to_string());

    Ok(CaddyConfigInput {
        admin_url: get_setting(state, "caddy_admin_url")
            .await
            .unwrap_or_else(|| "http://localhost:2019".to_string()),
        admin_user: required_setting(state, "caddy_admin_user").await,
        admin_password_hash: get_setting(state, "caddy_admin_password_hash").await,
        admin_listen: get_setting(state, "caddy_admin_listen")
            .await
            .unwrap_or_else(|| "127.0.0.1:2019".to_string()),
        lan_ip: required_setting(state, "caddy_lan_ip").await,
        admin_gate_port: get_setting(state, "caddy_admin_gate_port")
            .await
            .and_then(|value| value.parse().ok())
            .unwrap_or(2019),
        admin_allowed_ranges: split_csv(
            &required_setting(state, "caddy_admin_allowed_ranges").await,
        ),
        acme_email: required_setting(state, "caddy_acme_email").await,
        acme_ca: get_setting(state, "caddy_acme_ca").await,
        acme_zones: split_csv(&required_setting(state, "caddy_acme_zones").await),
        dns_provider: get_setting(state, "caddy_dns_provider")
            .await
            .unwrap_or_else(|| "cloudflare".to_string()),
        dns_token_placeholder: get_setting(state, "caddy_dns_token_placeholder")
            .await
            .unwrap_or_else(|| format!("{{env.{token_env}}}")),
        dns_resolvers: split_csv(
            &get_setting(state, "caddy_dns_resolvers")
                .await
                .unwrap_or_else(|| "1.1.1.1:53,8.8.8.8:53".to_string()),
        ),
        hosts,
    })
}

fn gate_fingerprint(input: &CaddyConfigInput, resolve_ip: Option<IpAddr>) -> String {
    let value = serde_json::json!({
        "caddy_admin_url": input.admin_url,
        "caddy_admin_listen": input.admin_listen,
        "caddy_lan_ip": input.lan_ip,
        "caddy_admin_resolve_ip": resolve_ip.map(|ip| ip.to_string()),
        "caddy_admin_gate_port": input.admin_gate_port,
        "caddy_admin_allowed_ranges": input.admin_allowed_ranges,
        "caddy_admin_user": input.admin_user,
        "caddy_admin_password_hash": input.admin_password_hash,
    });
    let bytes = serde_json::to_vec(&value).expect("gate fingerprint JSON is serializable");
    format!("{:x}", Sha256::digest(bytes))
}

async fn set_sync_state(
    state: &AppState,
    ok: bool,
    error_message: Option<String>,
    route_count: Option<usize>,
    locked_out: bool,
    gate_change_pending: bool,
) {
    let mut sync = state.caddy_sync.write().await;
    sync.last_ok = Some(ok);
    sync.last_at = Some(Utc::now().to_rfc3339());
    sync.last_error = error_message;
    sync.last_route_count = route_count;
    sync.locked_out = locked_out;
    sync.gate_change_pending = gate_change_pending;
}

async fn record_sync_error(
    state: &AppState,
    error_value: &SyncError,
    route_count: Option<usize>,
) {
    error!("Caddy sync failed: {error_value}");
    set_sync_state(
        state,
        false,
        Some(error_value.to_string()),
        route_count,
        matches!(error_value, SyncError::LockedOut(_)),
        matches!(error_value, SyncError::GateChangePending),
    )
    .await;
}

pub async fn sync_to_caddy(
    state: &AppState,
    opts: SyncOptions,
) -> Result<SyncReport, SyncError> {
    // This short-circuit deliberately precedes host/config loading and every
    // HTTP-client/request construction.
    if !caddy_managed(state).await {
        return Ok(SyncReport {
            skipped: true,
            route_count: 0,
            tls_subjects: Vec::new(),
        });
    }

    let input = match load_config_input(state).await {
        Ok(input) => input,
        Err(error_value) => {
            record_sync_error(state, &error_value, None).await;
            return Err(error_value);
        }
    };
    let route_count = input.hosts.len();
    let config = match build_caddy_config(&input) {
        Ok(config) => config,
        Err(error_value) => {
            let error_value = SyncError::Config(error_value.to_string());
            record_sync_error(state, &error_value, Some(route_count)).await;
            return Err(error_value);
        }
    };
    let tls_subjects = config["apps"]["tls"]["certificates"]["automate"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let access = load_admin_access(state).await;
    let fingerprint = gate_fingerprint(&input, access.resolve_ip);
    let stored_fingerprint = get_setting(state, "caddy_gate_fingerprint").await;
    if stored_fingerprint
        .as_deref()
        .is_some_and(|stored| stored != fingerprint)
        && !opts.confirm_gate_change
    {
        let error_value = SyncError::GateChangePending;
        record_sync_error(state, &error_value, Some(route_count)).await;
        return Err(error_value);
    }

    let json_bytes = match serde_json::to_vec(&config) {
        Ok(bytes) => bytes,
        Err(error) => {
            let error_value =
                SyncError::Config(format!("failed to encode Caddy config: {error}"));
            record_sync_error(state, &error_value, Some(route_count)).await;
            return Err(error_value);
        }
    };
    let load_request = match access.request(state, Method::POST, "/load") {
        Ok(request) => request,
        Err(error_value) => {
            record_sync_error(state, &error_value, Some(route_count)).await;
            return Err(error_value);
        }
    };
    let response = match load_request
        .header("Content-Type", "application/json")
        .body(json_bytes)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            let error_value = SyncError::Transport(error.to_string());
            record_sync_error(state, &error_value, Some(route_count)).await;
            return Err(error_value);
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let error_value = SyncError::Http { status, body };
        record_sync_error(state, &error_value, Some(route_count)).await;
        return Err(error_value);
    }

    let probe_request = match access.request(state, Method::GET, "/config/") {
        Ok(request) => request,
        Err(_) => {
            let error_value = SyncError::LockedOut(LOCKOUT_MESSAGE.to_string());
            record_sync_error(state, &error_value, Some(route_count)).await;
            return Err(error_value);
        }
    };
    let probe = probe_request
        .timeout(Duration::from_secs(5))
        .send()
        .await;
    if !matches!(probe, Ok(ref response) if response.status().is_success()) {
        let error_value = SyncError::LockedOut(LOCKOUT_MESSAGE.to_string());
        record_sync_error(state, &error_value, Some(route_count)).await;
        return Err(error_value);
    }

    if let Err(error) = sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('caddy_gate_fingerprint', ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(&fingerprint)
    .execute(&state.db)
    .await
    {
        let error_value =
            SyncError::Config(format!("failed to store Caddy gate fingerprint: {error}"));
        record_sync_error(state, &error_value, Some(route_count)).await;
        return Err(error_value);
    }

    set_sync_state(state, true, None, Some(route_count), false, false).await;
    info!("Caddy config synced successfully ({route_count} routes)");
    Ok(SyncReport {
        skipped: false,
        route_count,
        tls_subjects,
    })
}

async fn automatic_sync(state: &AppState) {
    if let Err(error_value) = sync_to_caddy(state, SyncOptions::default()).await {
        // The detailed failure is already recorded; SQLite remains authoritative.
        error!("Automatic Caddy sync did not apply: {error_value}");
    }
}

pub fn start_caddy_sync_task(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        if caddy_managed(&state).await {
            info!("Running initial Caddy config sync");
            automatic_sync(&state).await;
        }
    });
}

pub async fn status(State(state): State<AppState>) -> Result<Json<CaddyStatus>, AppError> {
    let configured = get_setting(&state, "caddy_admin_url").await.is_some();
    let managed = caddy_managed(&state).await;
    let access = load_admin_access(&state).await;
    let auth_enabled = !access.user.is_empty() && !access.password.is_empty();
    let reachable = if managed {
        match access.request(&state, Method::GET, "/config/") {
            Ok(request) => {
                matches!(request.send().await, Ok(response) if response.status().is_success())
            }
            Err(_) => false,
        }
    } else {
        false
    };

    let dynamic_pending = if let Some(stored) = get_setting(&state, "caddy_gate_fingerprint").await {
        match load_config_input(&state).await {
            Ok(input) => stored != gate_fingerprint(&input, access.resolve_ip),
            Err(_) => false,
        }
    } else {
        false
    };
    let sync = state.caddy_sync.read().await.clone();
    Ok(Json(CaddyStatus {
        configured,
        reachable,
        managed,
        auth_enabled,
        gate_change_pending: dynamic_pending,
        last_sync_ok: sync.last_ok,
        last_sync_at: sync.last_at,
        last_sync_error: sync.last_error,
        last_sync_route_count: sync.last_route_count,
        last_sync_locked_out: sync.locked_out,
    }))
}

pub async fn config_preview(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let input = load_config_input(&state)
        .await
        .map_err(|error_value| AppError::UnprocessableEntity(error_value.to_string()))?;
    let config = build_caddy_config(&input)
        .map_err(|error_value| AppError::UnprocessableEntity(error_value.to_string()))?;
    Ok(Json(config))
}

pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<CaddyProxyHost>>, AppError> {
    let rows = sqlx::query(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, tls_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|error_value| {
        error!("Failed to list caddy proxy hosts: {error_value}");
        AppError::Internal(error_value.to_string())
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|row| CaddyProxyHost {
                id: row.get("id"),
                domain: row.get("domain"),
                forward_host: row.get("forward_host"),
                forward_port: row.get::<i32, _>("forward_port") as u16,
                forward_scheme: row.get("forward_scheme"),
                enabled: row.get::<i32, _>("enabled") != 0,
                tls_enabled: row.get::<i32, _>("tls_enabled") != 0,
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            })
            .collect(),
    ))
}

pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CaddyProxyHostRequest>,
) -> Result<(StatusCode, Json<CaddyProxyHost>), AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO caddy_proxy_hosts (id, domain, forward_host, forward_port, forward_scheme, tls_enabled) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i32)
    .bind(&body.forward_scheme)
    .bind(body.tls_enabled as i32)
    .execute(&state.db)
    .await
    .map_err(|error_value| {
        error!("Failed to create caddy proxy host: {error_value}");
        AppError::Internal(error_value.to_string())
    })?;

    automatic_sync(&state).await;
    Ok((StatusCode::CREATED, Json(fetch_host_by_id(&state, &id).await?)))
}

pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CaddyProxyHostRequest>,
) -> Result<Json<CaddyProxyHost>, AppError> {
    let affected = sqlx::query(
        "UPDATE caddy_proxy_hosts \
         SET domain = ?, forward_host = ?, forward_port = ?, forward_scheme = ?, \
             tls_enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.domain)
    .bind(&body.forward_host)
    .bind(body.forward_port as i32)
    .bind(&body.forward_scheme)
    .bind(body.tls_enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|error_value| AppError::Internal(error_value.to_string()))?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    automatic_sync(&state).await;
    Ok(Json(fetch_host_by_id(&state, &id).await?))
}

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let affected = sqlx::query("DELETE FROM caddy_proxy_hosts WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|error_value| AppError::Internal(error_value.to_string()))?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    automatic_sync(&state).await;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn toggle(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<CaddyProxyHost>, AppError> {
    let affected = sqlx::query(
        "UPDATE caddy_proxy_hosts SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|error_value| AppError::Internal(error_value.to_string()))?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    automatic_sync(&state).await;
    Ok(Json(fetch_host_by_id(&state, &id).await?))
}

pub async fn sync(
    State(state): State<AppState>,
    body: Option<Json<SyncOptions>>,
) -> Json<SyncResponse> {
    match sync_to_caddy(&state, body.map(|Json(value)| value).unwrap_or_default()).await {
        Ok(report) => Json(SyncResponse {
            ok: true,
            skipped: report.skipped,
            route_count: report.route_count,
            error: None,
            gate_change_pending: false,
            locked_out: false,
        }),
        Err(error_value) => Json(SyncResponse {
            ok: false,
            skipped: false,
            route_count: state
                .caddy_sync
                .read()
                .await
                .last_route_count
                .unwrap_or_default(),
            error: Some(error_value.to_string()),
            gate_change_pending: matches!(error_value, SyncError::GateChangePending),
            locked_out: matches!(error_value, SyncError::LockedOut(_)),
        }),
    }
}

pub async fn test_connection(State(state): State<AppState>) -> Json<TestConnectionResponse> {
    let access = load_admin_access(&state).await;
    match access.request(&state, Method::GET, "/config/") {
        Err(error_value) => Json(TestConnectionResponse {
            success: false,
            message: error_value.to_string(),
        }),
        Ok(request) => match request.send().await {
            Ok(response) if response.status().is_success() => {
                let body = response.text().await.unwrap_or_default();
                let version_hint = if body.contains("apps") {
                    " (config loaded)"
                } else {
                    ""
                };
                Json(TestConnectionResponse {
                    success: true,
                    message: format!(
                        "Connected to Caddy Admin API at {}{version_hint}",
                        access.url
                    ),
                })
            }
            Ok(response) if response.status() == StatusCode::UNAUTHORIZED => {
                Json(TestConnectionResponse {
                    success: false,
                    message: "Caddy admin authentication failed (HTTP 401)".to_string(),
                })
            }
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                Json(TestConnectionResponse {
                    success: false,
                    message: format!("Caddy responded with HTTP {status}: {body}"),
                })
            }
            Err(error_value) => Json(TestConnectionResponse {
                success: false,
                message: format!("Failed to reach Caddy at {}: {error_value}", access.url),
            }),
        },
    }
}

async fn fetch_host_by_id(state: &AppState, id: &str) -> Result<CaddyProxyHost, AppError> {
    let row = sqlx::query(
        "SELECT id, domain, forward_host, forward_port, forward_scheme, \
         enabled, tls_enabled, created_at, updated_at \
         FROM caddy_proxy_hosts WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(CaddyProxyHost {
        id: row.get("id"),
        domain: row.get("domain"),
        forward_host: row.get("forward_host"),
        forward_port: row.get::<i32, _>("forward_port") as u16,
        forward_scheme: row.get("forward_scheme"),
        enabled: row.get::<i32, _>("enabled") != 0,
        tls_enabled: row.get::<i32, _>("tls_enabled") != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}
