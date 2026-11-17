use std::{collections::HashMap, fmt, net::IpAddr, sync::Arc, time::Duration};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::sync::RwLock;
use tracing::{error, info};

use super::{AppError, AppState};
use crate::caddy::{build_caddy_config, CaddyConfigInput, ProxyHostRow};

const DEFAULT_ADMIN_URL: &str = "http://localhost:2019";
const LOCKOUT_MESSAGE: &str = "config loaded but the admin gate is no longer reachable from Panoptikon — recover on the Caddy host via 127.0.0.1:2019 (see docs/caddy-production.md#recovery)";

// ─── DTOs ──────────────────────────────────────────────────

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

#[derive(Clone, Debug, Default)]
pub struct CaddySyncState {
    pub last_ok: Option<bool>,
    pub last_at: Option<String>,
    pub last_error: Option<String>,
    pub last_route_count: Option<usize>,
    pub locked_out: bool,
    pub gate_change_pending: bool,
}

pub type SharedCaddySyncState = Arc<RwLock<CaddySyncState>>;

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

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct SyncOptions {
    pub confirm_gate_change: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct SyncReport {
    pub skipped: bool,
    pub route_count: usize,
    pub tls_subjects: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
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
                write!(f, "Caddy rejected config load (HTTP {status}): {body}")
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

// ─── Settings and authenticated admin requests ─────────────

#[derive(Clone, Debug)]
struct RuntimeSettings {
    managed: bool,
    admin_url: String,
    admin_user: String,
    admin_password: String,
    admin_password_hash: Option<String>,
    admin_listen: String,
    lan_ip: String,
    admin_resolve_ip: String,
    admin_gate_port: u16,
    admin_allowed_ranges: Vec<String>,
    acme_email: String,
    acme_ca: Option<String>,
    acme_zones: Vec<String>,
    dns_provider: String,
    dns_token_placeholder: String,
    dns_resolvers: Vec<String>,
    dns_propagation_delay: String,
    stored_gate_fingerprint: Option<String>,
}

async fn caddy_setting_map(state: &AppState) -> Result<HashMap<String, String>, SyncError> {
    let rows = sqlx::query("SELECT key, value FROM settings WHERE key LIKE 'caddy_%'")
        .fetch_all(&state.db)
        .await
        .map_err(|error| SyncError::Config(format!("failed to load Caddy settings: {error}")))?;
    Ok(rows
        .into_iter()
        .map(|row| (row.get::<String, _>("key"), row.get::<String, _>("value")))
        .collect())
}

async fn managed_setting(state: &AppState) -> Result<bool, SyncError> {
    let value =
        sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'caddy_managed'")
            .fetch_optional(&state.db)
            .await
            .map_err(|error| SyncError::Config(format!("failed to load caddy_managed: {error}")))?;
    Ok(value.is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true")))
}

async fn load_runtime_settings(state: &AppState) -> Result<RuntimeSettings, SyncError> {
    let values = caddy_setting_map(state).await?;
    let get = |key: &str| values.get(key).cloned().unwrap_or_default();
    let lan_ip = get("caddy_lan_ip");
    let token_env = values
        .get("caddy_dns_token_env")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| "CLOUDFLARE_API_TOKEN".to_string());
    let token_placeholder = values
        .get("caddy_dns_token_placeholder")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| format!("{{env.{token_env}}}"));

    Ok(RuntimeSettings {
        managed: values
            .get("caddy_managed")
            .is_some_and(|value| value == "1" || value.eq_ignore_ascii_case("true")),
        admin_url: values
            .get("caddy_admin_url")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or_else(|| DEFAULT_ADMIN_URL.to_string()),
        admin_user: get("caddy_admin_user"),
        admin_password: get("caddy_admin_password"),
        admin_password_hash: values
            .get("caddy_admin_password_hash")
            .filter(|value| !value.is_empty())
            .cloned(),
        admin_listen: values
            .get("caddy_admin_listen")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or_else(|| "127.0.0.1:2019".to_string()),
        lan_ip: lan_ip.clone(),
        admin_resolve_ip: values
            .get("caddy_admin_resolve_ip")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or(lan_ip),
        admin_gate_port: values
            .get("caddy_admin_gate_port")
            .and_then(|value| value.parse().ok())
            .unwrap_or(2019),
        admin_allowed_ranges: split_csv(&get("caddy_admin_allowed_ranges")),
        acme_email: get("caddy_acme_email"),
        acme_ca: values
            .get("caddy_acme_ca")
            .filter(|value| !value.is_empty())
            .cloned(),
        acme_zones: split_csv(&get("caddy_acme_zones")),
        dns_provider: values
            .get("caddy_dns_provider")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or_else(|| "cloudflare".to_string()),
        dns_token_placeholder: token_placeholder,
        dns_resolvers: values
            .get("caddy_dns_resolvers")
            .map(|value| split_csv(value))
            .filter(|values| !values.is_empty())
            .unwrap_or_else(|| vec!["1.1.1.1:53".into(), "8.8.8.8:53".into()]),
        dns_propagation_delay: values
            .get("caddy_dns_propagation_delay")
            .filter(|value| !value.is_empty())
            .cloned()
            .unwrap_or_else(|| "20s".to_string()),
        stored_gate_fingerprint: values
            .get("caddy_gate_fingerprint")
            .filter(|value| !value.is_empty())
            .cloned(),
    })
}

fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

async fn load_config_input(
    state: &AppState,
    settings: &RuntimeSettings,
) -> Result<CaddyConfigInput, SyncError> {
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
                forward_port: forward_port as u16,
                forward_scheme,
                tls_enabled: tls_enabled != 0,
            },
        )
        .collect();

    Ok(CaddyConfigInput {
        admin_url: settings.admin_url.clone(),
        admin_listen: settings.admin_listen.clone(),
        admin_user: settings.admin_user.clone(),
        admin_password_hash: settings.admin_password_hash.clone(),
        lan_ip: settings.lan_ip.clone(),
        admin_gate_port: settings.admin_gate_port,
        admin_allowed_ranges: settings.admin_allowed_ranges.clone(),
        acme_email: settings.acme_email.clone(),
        acme_ca: settings.acme_ca.clone(),
        acme_zones: settings.acme_zones.clone(),
        dns_provider: settings.dns_provider.clone(),
        dns_token_placeholder: settings.dns_token_placeholder.clone(),
        dns_resolvers: settings.dns_resolvers.clone(),
        dns_propagation_delay: settings.dns_propagation_delay.clone(),
        hosts,
    })
}

fn gate_fingerprint(settings: &RuntimeSettings) -> String {
    let canonical = serde_json::to_vec(&serde_json::json!({
        "admin_url": settings.admin_url,
        "admin_listen": settings.admin_listen,
        "lan_ip": settings.lan_ip,
        "admin_resolve_ip": settings.admin_resolve_ip,
        "admin_gate_port": settings.admin_gate_port,
        "admin_allowed_ranges": settings.admin_allowed_ranges,
        "admin_user": settings.admin_user,
        "admin_password_hash": settings.admin_password_hash,
    }))
    .expect("serialising a JSON value cannot fail");
    format!("{:x}", Sha256::digest(canonical))
}

struct AdminEndpoint {
    client: reqwest::Client,
    base_url: String,
    user: String,
    password: String,
}

impl AdminEndpoint {
    fn request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {
        let mut request = self.client.request(
            method,
            format!("{}{}", self.base_url.trim_end_matches('/'), path),
        );
        if !self.user.is_empty() {
            request = request.basic_auth(&self.user, Some(&self.password));
        }
        request
    }
}

fn admin_endpoint(
    state: &AppState,
    settings: &RuntimeSettings,
) -> Result<AdminEndpoint, SyncError> {
    let url = reqwest::Url::parse(&settings.admin_url).map_err(|error| {
        SyncError::Config(format!(
            "invalid caddy_admin_url '{}': {error}",
            settings.admin_url
        ))
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(SyncError::Config(
            "caddy_admin_url must use http or https".into(),
        ));
    }

    let client = if settings.admin_resolve_ip.is_empty() {
        state.caddy_http.clone()
    } else {
        let host = url
            .host_str()
            .ok_or_else(|| SyncError::Config("caddy_admin_url has no host".into()))?;
        if host.parse::<IpAddr>().is_ok() {
            state.caddy_http.clone()
        } else {
            let ip: IpAddr = settings.admin_resolve_ip.parse().map_err(|_| {
                SyncError::Config("caddy_admin_resolve_ip must be a valid IP address".into())
            })?;
            let port = url.port_or_known_default().ok_or_else(|| {
                SyncError::Config("caddy_admin_url has no resolvable port".into())
            })?;
            reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .resolve(host, std::net::SocketAddr::new(ip, port))
                .build()
                .map_err(|error| {
                    SyncError::Config(format!("failed to build Caddy HTTP client: {error}"))
                })?
        }
    };

    Ok(AdminEndpoint {
        client,
        base_url: settings.admin_url.clone(),
        user: settings.admin_user.clone(),
        password: settings.admin_password.clone(),
    })
}

// ─── Atomic sync ────────────────────────────────────────────

pub fn start_caddy_sync_task(state: AppState) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        match sync_to_caddy(&state, SyncOptions::default()).await {
            Ok(report) if report.skipped => {
                info!("Initial Caddy sync skipped because managed mode is disabled");
            }
            Ok(_) => {}
            Err(error) => error!(%error, "Initial Caddy sync failed"),
        }
    });
}

/// Validate and atomically replace the complete Caddy configuration.
///
/// A managed push makes exactly one config-changing request (`POST /load`),
/// then one read-only reachability probe (`GET /config/`).
pub async fn sync_to_caddy(state: &AppState, opts: SyncOptions) -> Result<SyncReport, SyncError> {
    // This short-circuit deliberately precedes host loading, generation and
    // client construction. Unmanaged mode cannot open a Caddy TCP connection.
    match managed_setting(state).await {
        Ok(false) => {
            return Ok(SyncReport {
                skipped: true,
                ..SyncReport::default()
            });
        }
        Ok(true) => {}
        Err(error) => {
            record_failure(state, &error, None, false, false).await;
            error!(%error, "Caddy sync failed");
            return Err(error);
        }
    }

    let settings = match load_runtime_settings(state).await {
        Ok(settings) => settings,
        Err(error) => {
            record_failure(state, &error, None, false, false).await;
            error!(%error, "Caddy sync failed");
            return Err(error);
        }
    };
    debug_assert!(settings.managed);

    let input = match load_config_input(state, &settings).await {
        Ok(input) => input,
        Err(error) => {
            record_failure(state, &error, None, false, false).await;
            error!(%error, "Caddy sync failed");
            return Err(error);
        }
    };
    let route_count = input.hosts.len();
    let config = match build_caddy_config(&input) {
        Ok(config) => config,
        Err(config_error) => {
            let error = SyncError::Config(config_error.to_string());
            record_failure(state, &error, Some(route_count), false, false).await;
            error!(%error, "Caddy sync config generation failed");
            return Err(error);
        }
    };
    let tls_subjects = config
        .pointer("/apps/tls/certificates/automate")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let fingerprint = gate_fingerprint(&settings);
    if settings
        .stored_gate_fingerprint
        .as_deref()
        .is_some_and(|stored| stored != fingerprint)
        && !opts.confirm_gate_change
    {
        let error = SyncError::GateChangePending;
        record_failure(state, &error, Some(route_count), false, true).await;
        error!(%error, "Caddy sync refused");
        return Err(error);
    }

    let endpoint = match admin_endpoint(state, &settings) {
        Ok(endpoint) => endpoint,
        Err(error) => {
            record_failure(state, &error, Some(route_count), false, false).await;
            error!(%error, "Caddy sync failed");
            return Err(error);
        }
    };
    let json_bytes = serde_json::to_vec(&config)
        .map_err(|error| SyncError::Config(format!("failed to encode Caddy config: {error}")))?;

    let response = match endpoint
        .request(Method::POST, "/load")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(json_bytes)
        .send()
        .await
    {
        Ok(response) => response,
        Err(request_error) => {
            let error =
                SyncError::Transport(format!("Caddy config load request failed: {request_error}"));
            record_failure(state, &error, Some(route_count), false, false).await;
            error!(%error, "Caddy sync failed");
            return Err(error);
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let error = SyncError::Http { status, body };
        record_failure(state, &error, Some(route_count), false, false).await;
        error!(%error, "Caddy rejected atomic config load");
        return Err(error);
    }

    let probe_ok = endpoint
        .request(Method::GET, "/config/")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .is_ok_and(|response| response.status().is_success());
    if !probe_ok {
        let error = SyncError::LockedOut(LOCKOUT_MESSAGE.to_string());
        record_failure(state, &error, Some(route_count), true, false).await;
        error!(%error, "Caddy config loaded but post-push probe failed");
        return Err(error);
    }

    if let Err(db_error) = sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES ('caddy_gate_fingerprint', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
    )
    .bind(&fingerprint)
    .execute(&state.db)
    .await
    {
        let error = SyncError::Config(format!(
            "Caddy config loaded but gate fingerprint could not be saved: {db_error}"
        ));
        record_failure(state, &error, Some(route_count), false, false).await;
        error!(%error, "Caddy sync bookkeeping failed");
        return Err(error);
    }

    {
        let mut sync = state.caddy_sync.write().await;
        *sync = CaddySyncState {
            last_ok: Some(true),
            last_at: Some(Utc::now().to_rfc3339()),
            last_error: None,
            last_route_count: Some(route_count),
            locked_out: false,
            gate_change_pending: false,
        };
    }
    info!(
        route_count,
        "Caddy config atomically loaded and gate probe passed"
    );
    Ok(SyncReport {
        skipped: false,
        route_count,
        tls_subjects,
    })
}

async fn record_failure(
    state: &AppState,
    error: &SyncError,
    route_count: Option<usize>,
    locked_out: bool,
    gate_change_pending: bool,
) {
    let mut sync = state.caddy_sync.write().await;
    sync.last_ok = Some(false);
    sync.last_at = Some(Utc::now().to_rfc3339());
    sync.last_error = Some(error.to_string());
    sync.last_route_count = route_count;
    sync.locked_out = locked_out;
    sync.gate_change_pending = gate_change_pending;
}

// ─── Handlers ──────────────────────────────────────────────

pub async fn status(State(state): State<AppState>) -> Json<CaddyStatus> {
    let settings = load_runtime_settings(&state).await.ok();
    let managed = settings.as_ref().is_some_and(|settings| settings.managed);
    let auth_enabled = settings.as_ref().is_some_and(|settings| {
        !settings.admin_user.is_empty() && !settings.admin_password.is_empty()
    });
    let computed_pending = settings.as_ref().is_some_and(|settings| {
        settings
            .stored_gate_fingerprint
            .as_deref()
            .is_some_and(|stored| stored != gate_fingerprint(settings))
    });

    // Managed=false is a hard network-I/O gate, including status polling.
    let reachable = if managed {
        if let Some(settings) = settings.as_ref() {
            match admin_endpoint(&state, settings) {
                Ok(endpoint) => endpoint
                    .request(Method::GET, "/config/")
                    .timeout(Duration::from_secs(5))
                    .send()
                    .await
                    .is_ok_and(|response| response.status().is_success()),
                Err(_) => false,
            }
        } else {
            false
        }
    } else {
        false
    };

    let sync = state.caddy_sync.read().await.clone();
    Json(CaddyStatus {
        configured: settings.is_some(),
        reachable,
        managed,
        auth_enabled,
        gate_change_pending: computed_pending || sync.gate_change_pending,
        last_sync_ok: sync.last_ok,
        last_sync_at: sync.last_at,
        last_sync_error: sync.last_error,
        last_sync_route_count: sync.last_route_count,
        last_sync_locked_out: sync.locked_out,
    })
}

pub async fn config_preview(State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let settings = load_runtime_settings(&state)
        .await
        .map_err(|error| AppError::UnprocessableEntity(error.to_string()))?;
    let input = load_config_input(&state, &settings)
        .await
        .map_err(|error| AppError::UnprocessableEntity(error.to_string()))?;
    let config = build_caddy_config(&input)
        .map_err(|error| AppError::UnprocessableEntity(error.to_string()))?;
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
    .map_err(|error| {
        error!(%error, "Failed to list Caddy proxy hosts");
        AppError::Internal(error.to_string())
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
    .map_err(|error| {
        error!(%error, "Failed to create Caddy proxy host");
        AppError::Internal(error.to_string())
    })?;

    let _ = sync_to_caddy(&state, SyncOptions::default()).await;
    Ok((
        StatusCode::CREATED,
        Json(fetch_host_by_id(&state, &id).await?),
    ))
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
    .map_err(|error| AppError::Internal(error.to_string()))?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }

    let _ = sync_to_caddy(&state, SyncOptions::default()).await;
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
        .map_err(|error| AppError::Internal(error.to_string()))?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }

    let _ = sync_to_caddy(&state, SyncOptions::default()).await;
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
    .map_err(|error| AppError::Internal(error.to_string()))?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }

    let _ = sync_to_caddy(&state, SyncOptions::default()).await;
    Ok(Json(fetch_host_by_id(&state, &id).await?))
}

pub async fn sync(
    State(state): State<AppState>,
    options: Option<Json<SyncOptions>>,
) -> Json<SyncResponse> {
    match sync_to_caddy(&state, options.map(|Json(value)| value).unwrap_or_default()).await {
        Ok(report) => Json(SyncResponse {
            ok: true,
            skipped: report.skipped,
            route_count: report.route_count,
            error: None,
            gate_change_pending: false,
            locked_out: false,
        }),
        Err(error) => Json(SyncResponse {
            ok: false,
            skipped: false,
            route_count: state
                .caddy_sync
                .read()
                .await
                .last_route_count
                .unwrap_or_default(),
            error: Some(error.to_string()),
            gate_change_pending: matches!(error, SyncError::GateChangePending),
            locked_out: matches!(error, SyncError::LockedOut(_)),
        }),
    }
}

pub async fn test_connection(State(state): State<AppState>) -> Json<TestConnectionResponse> {
    let settings = match load_runtime_settings(&state).await {
        Ok(settings) => settings,
        Err(error) => {
            return Json(TestConnectionResponse {
                success: false,
                message: error.to_string(),
            });
        }
    };
    let endpoint = match admin_endpoint(&state, &settings) {
        Ok(endpoint) => endpoint,
        Err(error) => {
            return Json(TestConnectionResponse {
                success: false,
                message: error.to_string(),
            });
        }
    };

    match endpoint
        .request(Method::GET, "/config/")
        .timeout(Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => Json(TestConnectionResponse {
            success: true,
            message: format!("Connected to Caddy Admin API at {}", settings.admin_url),
        }),
        Ok(response) if response.status() == reqwest::StatusCode::UNAUTHORIZED => {
            Json(TestConnectionResponse {
                success: false,
                message: "Caddy authentication failed (HTTP 401)".into(),
            })
        }
        Ok(response) => Json(TestConnectionResponse {
            success: false,
            message: format!("Caddy responded with HTTP {}", response.status()),
        }),
        Err(error) => Json(TestConnectionResponse {
            success: false,
            message: format!("Failed to reach Caddy at {}: {error}", settings.admin_url),
        }),
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
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
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
