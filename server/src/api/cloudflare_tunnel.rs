use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{error, info, warn};

use super::{AppError, AppState};

// ─── Cloudflare API base URL ────────────────────────────────
const CF_API_BASE: &str = "https://api.cloudflare.com/client/v4";

// ─── DTOs ───────────────────────────────────────────────────

/// Cloudflare Tunnel status returned to the frontend.
#[derive(Debug, Serialize)]
pub struct TunnelStatus {
    pub configured: bool,
    pub connected: bool,
    pub tunnel_id: Option<String>,
    pub tunnel_name: Option<String>,
    pub created_at: Option<String>,
    pub connections: Vec<TunnelConnection>,
}

/// An active Cloudflare Tunnel connection (connector).
#[derive(Debug, Serialize)]
pub struct TunnelConnection {
    pub colo_name: Option<String>,
    pub is_pending_reconnect: bool,
    pub origin_ip: Option<String>,
    pub opened_at: Option<String>,
}

/// A tunnel route (hostname → service mapping).
#[derive(Debug, Serialize)]
pub struct TunnelRoute {
    pub hostname: String,
    pub service: String,
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns: Option<TunnelRouteDns>,
}

/// Cloudflare DNS status for a tunnel route hostname.
#[derive(Debug, Serialize, Clone)]
pub struct TunnelRouteDns {
    pub configured: bool,
    pub status: String,
    pub message: String,
    pub zone_name: Option<String>,
    pub record_type: Option<String>,
    pub proxied: Option<bool>,
    pub target: Option<String>,
}

/// Response for the routes endpoint.
#[derive(Debug, Serialize)]
pub struct TunnelRoutesResponse {
    pub routes: Vec<TunnelRoute>,
}

/// Request body for adding a new tunnel route.
#[derive(Debug, Deserialize)]
pub struct AddRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Request body for updating an existing tunnel route.
#[derive(Debug, Deserialize)]
pub struct UpdateRouteRequest {
    pub hostname: String,
    pub service: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// Generic write response.
#[derive(Debug, Serialize)]
pub struct TunnelWriteResponse {
    pub success: bool,
    pub message: String,
}

// ─── Helpers ────────────────────────────────────────────────

/// Read a setting from the database.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Cloudflare config required for API calls.
struct CfConfig {
    api_token: String,
    account_id: String,
    tunnel_id: String,
}

/// Load Cloudflare configuration from settings.
async fn load_cf_config(state: &AppState) -> Option<CfConfig> {
    let api_token = get_setting(state, "cloudflare_api_token").await?;
    let account_id = get_setting(state, "cloudflare_account_id").await?;
    let tunnel_id = get_setting(state, "cloudflare_tunnel_id").await?;
    Some(CfConfig {
        api_token,
        account_id,
        tunnel_id,
    })
}

/// Build a reqwest client for Cloudflare API calls.
fn cf_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("cloudflare HTTP client")
}

fn normalize_path_matcher(path: Option<String>) -> Option<String> {
    let path = path?.trim().to_string();
    if path.is_empty() || path == "/" {
        None
    } else {
        Some(path)
    }
}

fn cf_api_base() -> String {
    env::var("PANOPTIKON_CF_API_BASE").unwrap_or_else(|_| CF_API_BASE.to_string())
}

// ─── Handlers ───────────────────────────────────────────────

/// GET /api/v1/cloudflare-tunnel/status
///
/// Returns tunnel status including whether it's connected and active connections.
pub async fn status(State(state): State<AppState>) -> Json<TunnelStatus> {
    let config = match load_cf_config(&state).await {
        Some(c) => c,
        None => {
            return Json(TunnelStatus {
                configured: false,
                connected: false,
                tunnel_id: None,
                tunnel_name: None,
                created_at: None,
                connections: vec![],
            });
        }
    };

    let client = cf_http_client();

    // Fetch tunnel details.
    let tunnel_url = format!(
        "{}/accounts/{}/cfd_tunnel/{}",
        cf_api_base(),
        config.account_id,
        config.tunnel_id
    );

    let tunnel_resp = client
        .get(&tunnel_url)
        .bearer_auth(&config.api_token)
        .send()
        .await;

    let (tunnel_name, created_at, connections) = match tunnel_resp {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let result = &body["result"];
            let name = result["name"].as_str().map(|s| s.to_string());
            let created = result["created_at"].as_str().map(|s| s.to_string());

            // Parse connections from the tunnel response.
            let conns = result["connections"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .map(|c| TunnelConnection {
                            colo_name: c["colo_name"].as_str().map(|s| s.to_string()),
                            is_pending_reconnect: c["is_pending_reconnect"]
                                .as_bool()
                                .unwrap_or(false),
                            origin_ip: c["origin_ip"].as_str().map(|s| s.to_string()),
                            opened_at: c["opened_at"].as_str().map(|s| s.to_string()),
                        })
                        .collect()
                })
                .unwrap_or_default();

            (name, created, conns)
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!("Cloudflare tunnel API returned HTTP {status}: {body}");
            (None, None, vec![])
        }
        Err(e) => {
            warn!("Failed to reach Cloudflare API: {e}");
            (None, None, vec![])
        }
    };

    let connected = !connections.is_empty();

    Json(TunnelStatus {
        configured: true,
        connected,
        tunnel_id: Some(config.tunnel_id),
        tunnel_name,
        created_at,
        connections,
    })
}

/// GET /api/v1/cloudflare-tunnel/routes
///
/// Returns the hostname → service mapping from the tunnel configuration.
pub async fn list_routes(
    State(state): State<AppState>,
) -> Result<Json<TunnelRoutesResponse>, AppError> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        AppError::Validation("Cloudflare tunnel not configured".into())
    })?;

    let routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel routes: {e}");
        AppError::Internal(e.to_string())
    })?;
    let routes = annotate_dns_status(&config, routes).await;

    Ok(Json(TunnelRoutesResponse { routes }))
}

/// POST /api/v1/cloudflare-tunnel/routes
///
/// Add a new hostname route to the tunnel configuration.
pub async fn add_route(
    State(state): State<AppState>,
    Json(body): Json<AddRouteRequest>,
) -> Result<(StatusCode, Json<TunnelWriteResponse>), AppError> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        AppError::Validation("Cloudflare tunnel not configured".into())
    })?;

    // Fetch current configuration.
    let mut routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    // Check for duplicate hostname.
    if routes
        .iter()
        .any(|r| r.hostname.eq_ignore_ascii_case(&body.hostname))
    {
        return Ok((
            StatusCode::CONFLICT,
            Json(TunnelWriteResponse {
                success: false,
                message: format!("Route for hostname '{}' already exists", body.hostname),
            }),
        ));
    }

    ensure_route_dns(&config, &body.hostname)
        .await
        .map_err(DnsEnsureError::into_app_error)?;

    // Add new route.
    routes.push(TunnelRoute {
        hostname: body.hostname.clone(),
        service: body.service.clone(),
        path: normalize_path_matcher(body.path.clone()),
        dns: None,
    });

    // Write back to Cloudflare.
    write_ingress_routes(&config, &routes).await.map_err(|e| {
        error!("Failed to update tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    info!(
        hostname = %body.hostname,
        service = %body.service,
        "Added Cloudflare Tunnel route"
    );

    Ok((
        StatusCode::CREATED,
        Json(TunnelWriteResponse {
            success: true,
            message: format!("Route for '{}' added successfully", body.hostname),
        }),
    ))
}

/// DELETE /api/v1/cloudflare-tunnel/routes/:hostname
///
/// Remove a hostname route from the tunnel configuration.
pub async fn delete_route(
    State(state): State<AppState>,
    Path(hostname): Path<String>,
) -> Result<Json<TunnelWriteResponse>, AppError> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        AppError::Validation("Cloudflare tunnel not configured".into())
    })?;

    // Fetch current configuration.
    let mut routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    let original_len = routes.len();
    routes.retain(|r| !r.hostname.eq_ignore_ascii_case(&hostname));

    if routes.len() == original_len {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("No route found for hostname '{hostname}'"),
        }));
    }

    // Write back to Cloudflare.
    write_ingress_routes(&config, &routes).await.map_err(|e| {
        error!("Failed to update tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    info!(hostname = %hostname, "Removed Cloudflare Tunnel route");

    Ok(Json(TunnelWriteResponse {
        success: true,
        message: format!("Route for '{hostname}' removed successfully"),
    }))
}

/// PUT /api/v1/cloudflare-tunnel/routes/:hostname
///
/// Update an existing hostname route in the tunnel configuration.
pub async fn update_route(
    State(state): State<AppState>,
    Path(old_hostname): Path<String>,
    Json(body): Json<UpdateRouteRequest>,
) -> Result<Json<TunnelWriteResponse>, AppError> {
    let config = load_cf_config(&state).await.ok_or_else(|| {
        warn!("Cloudflare tunnel not configured");
        AppError::Validation("Cloudflare tunnel not configured".into())
    })?;

    // Fetch current configuration.
    let mut routes = fetch_ingress_routes(&config).await.map_err(|e| {
        error!("Failed to fetch tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    // Find the route to update.
    let route_idx = routes
        .iter()
        .position(|r| r.hostname.eq_ignore_ascii_case(&old_hostname));

    let Some(idx) = route_idx else {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("No route found for hostname '{old_hostname}'"),
        }));
    };

    // If hostname is being changed, check the new hostname isn't already taken.
    if !body.hostname.eq_ignore_ascii_case(&old_hostname)
        && routes
            .iter()
            .any(|r| r.hostname.eq_ignore_ascii_case(&body.hostname))
    {
        return Ok(Json(TunnelWriteResponse {
            success: false,
            message: format!("Route for hostname '{}' already exists", body.hostname),
        }));
    }

    ensure_route_dns(&config, &body.hostname)
        .await
        .map_err(DnsEnsureError::into_app_error)?;

    // Update the route in place.
    routes[idx] = TunnelRoute {
        hostname: body.hostname.clone(),
        service: body.service.clone(),
        path: normalize_path_matcher(body.path.clone()),
        dns: None,
    };

    // Write back to Cloudflare.
    write_ingress_routes(&config, &routes).await.map_err(|e| {
        error!("Failed to update tunnel config: {e}");
        AppError::Internal(e.to_string())
    })?;

    info!(
        old_hostname = %old_hostname,
        hostname = %body.hostname,
        service = %body.service,
        "Updated Cloudflare Tunnel route"
    );

    Ok(Json(TunnelWriteResponse {
        success: true,
        message: format!("Route for '{}' updated successfully", body.hostname),
    }))
}

// ─── Cloudflare API helpers ─────────────────────────────────

/// Fetch the ingress routes from the Cloudflare Tunnel configuration.
async fn fetch_ingress_routes(config: &CfConfig) -> anyhow::Result<Vec<TunnelRoute>> {
    let client = cf_http_client();
    let url = format!(
        "{}/accounts/{}/cfd_tunnel/{}/configurations",
        cf_api_base(),
        config.account_id,
        config.tunnel_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(&config.api_token)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Cloudflare API returned HTTP {status}: {body}");
    }

    let body: serde_json::Value = resp.json().await?;
    let ingress = body["result"]["config"]["ingress"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let routes: Vec<TunnelRoute> = ingress
        .iter()
        .filter_map(|entry| {
            // Skip the catch-all rule (no hostname).
            let hostname = entry["hostname"].as_str()?;
            let service = entry["service"].as_str().unwrap_or("").to_string();
            let path = normalize_path_matcher(entry["path"].as_str().map(|s| s.to_string()));
            Some(TunnelRoute {
                hostname: hostname.to_string(),
                service,
                path,
                dns: None,
            })
        })
        .collect();

    Ok(routes)
}

#[derive(Debug, Deserialize)]
struct CfListResponse<T> {
    success: bool,
    #[serde(default = "empty_cf_result")]
    result: Vec<T>,
    #[serde(default)]
    errors: Vec<CfApiError>,
}

fn empty_cf_result<T>() -> Vec<T> {
    Vec::new()
}

#[derive(Debug, Deserialize)]
struct CfItemResponse<T> {
    success: bool,
    result: Option<T>,
    #[serde(default)]
    errors: Vec<CfApiError>,
}

#[derive(Debug, Deserialize)]
struct CfApiError {
    message: String,
}

#[derive(Debug, Deserialize, Clone)]
struct CfZone {
    id: String,
    name: String,
}

#[derive(Debug, Deserialize, Clone)]
struct CfDnsRecord {
    id: String,
    #[serde(rename = "type")]
    record_type: String,
    name: String,
    content: String,
    proxied: Option<bool>,
}

#[derive(Debug)]
enum DnsEnsureError {
    MissingZone(String),
    Conflict(String),
    Upstream(String),
}

impl DnsEnsureError {
    fn into_app_error(self) -> AppError {
        match self {
            DnsEnsureError::MissingZone(message) => AppError::PreconditionRequired(message),
            DnsEnsureError::Conflict(message) => AppError::Conflict(message),
            DnsEnsureError::Upstream(message) => AppError::BadGateway(message),
        }
    }
}

fn tunnel_dns_target(config: &CfConfig) -> String {
    format!("{}.cfargotunnel.com", config.tunnel_id)
}

fn normalize_dns_value(value: &str) -> String {
    value.trim().trim_end_matches('.').to_ascii_lowercase()
}

fn hostname_zone_candidates(hostname: &str) -> Vec<String> {
    let labels: Vec<&str> = hostname.trim().trim_end_matches('.').split('.').collect();
    if labels.len() < 2 {
        return vec![];
    }
    (0..labels.len() - 1)
        .map(|idx| labels[idx..].join(".").to_ascii_lowercase())
        .collect()
}

fn cf_error_message(errors: &[CfApiError], fallback: &str) -> String {
    errors
        .first()
        .map(|e| e.message.clone())
        .unwrap_or_else(|| fallback.to_string())
}

async fn find_managed_zone(
    client: &reqwest::Client,
    config: &CfConfig,
    hostname: &str,
) -> Result<Option<CfZone>, DnsEnsureError> {
    let url = format!("{}/zones", cf_api_base());

    for name in hostname_zone_candidates(hostname) {
        let resp = client
            .get(&url)
            .bearer_auth(&config.api_token)
            .query(&[("name", name.as_str()), ("status", "active")])
            .send()
            .await
            .map_err(|e| {
                DnsEnsureError::Upstream(format!(
                    "Unable to query Cloudflare zones for '{hostname}': {e}"
                ))
            })?;

        let status = resp.status();
        let body: CfListResponse<CfZone> = resp.json().await.map_err(|e| {
            DnsEnsureError::Upstream(format!(
                "Unable to parse Cloudflare zone lookup for '{hostname}': {e}"
            ))
        })?;

        if !status.is_success() || !body.success {
            return Err(DnsEnsureError::Upstream(format!(
                "Cloudflare zone lookup failed for '{hostname}': {}. Ensure the API token has Zone:Read permission.",
                cf_error_message(&body.errors, &status.to_string())
            )));
        }

        if let Some(zone) = body.result.into_iter().find(|zone| zone.name == name) {
            return Ok(Some(zone));
        }
    }

    Ok(None)
}

async fn fetch_dns_records(
    client: &reqwest::Client,
    config: &CfConfig,
    zone: &CfZone,
    hostname: &str,
) -> Result<Vec<CfDnsRecord>, DnsEnsureError> {
    let url = format!("{}/zones/{}/dns_records", cf_api_base(), zone.id);
    let resp = client
        .get(&url)
        .bearer_auth(&config.api_token)
        .query(&[("name", hostname), ("per_page", "100")])
        .send()
        .await
        .map_err(|e| {
            DnsEnsureError::Upstream(format!(
                "Unable to query Cloudflare DNS records for '{hostname}': {e}"
            ))
        })?;

    let status = resp.status();
    let body: CfListResponse<CfDnsRecord> = resp.json().await.map_err(|e| {
        DnsEnsureError::Upstream(format!(
            "Unable to parse Cloudflare DNS records for '{hostname}': {e}"
        ))
    })?;

    if !status.is_success() || !body.success {
        return Err(DnsEnsureError::Upstream(format!(
            "Cloudflare DNS lookup failed for '{hostname}': {}. Ensure the API token has Zone:Read permission for '{}'.",
            cf_error_message(&body.errors, &status.to_string()),
            zone.name
        )));
    }

    Ok(body.result)
}

fn matching_cname<'a>(records: &'a [CfDnsRecord], target: &str) -> Option<&'a CfDnsRecord> {
    records.iter().find(|record| {
        record.record_type.eq_ignore_ascii_case("CNAME")
            && normalize_dns_value(&record.content) == normalize_dns_value(target)
    })
}

fn dns_status_from_records(
    hostname: &str,
    zone: &CfZone,
    target: &str,
    records: &[CfDnsRecord],
) -> TunnelRouteDns {
    if records.is_empty() {
        return TunnelRouteDns {
            configured: false,
            status: "missing".to_string(),
            message: format!("Create a proxied CNAME for {hostname} to {target}."),
            zone_name: Some(zone.name.clone()),
            record_type: None,
            proxied: None,
            target: Some(target.to_string()),
        };
    }

    if let Some(record) = matching_cname(records, target) {
        let proxied = record.proxied.unwrap_or(false);
        return TunnelRouteDns {
            configured: proxied,
            status: if proxied { "configured" } else { "unproxied" }.to_string(),
            message: if proxied {
                format!("{hostname} has a proxied CNAME to {target}.")
            } else {
                format!("{hostname} points to {target}, but the CNAME is not proxied.")
            },
            zone_name: Some(zone.name.clone()),
            record_type: Some(record.record_type.clone()),
            proxied: Some(proxied),
            target: Some(record.content.clone()),
        };
    }

    let record = &records[0];
    TunnelRouteDns {
        configured: false,
        status: "conflict".to_string(),
        message: format!(
            "{hostname} has a conflicting {} record pointing to '{}'. Replace it with a proxied CNAME to {target}.",
            record.record_type, record.content
        ),
        zone_name: Some(zone.name.clone()),
        record_type: Some(record.record_type.clone()),
        proxied: record.proxied,
        target: Some(record.content.clone()),
    }
}

async fn route_dns_status(
    client: &reqwest::Client,
    config: &CfConfig,
    hostname: &str,
) -> TunnelRouteDns {
    let target = tunnel_dns_target(config);
    let zone = match find_managed_zone(client, config, hostname).await {
        Ok(Some(zone)) => zone,
        Ok(None) => {
            return TunnelRouteDns {
                configured: false,
                status: "zone_missing".to_string(),
                message: format!(
                    "No managed Cloudflare zone was found for {hostname}. Add the zone to Cloudflare or create a proxied CNAME for {hostname} to {target}."
                ),
                zone_name: None,
                record_type: None,
                proxied: None,
                target: Some(target),
            };
        }
        Err(err) => {
            return TunnelRouteDns {
                configured: false,
                status: "unknown".to_string(),
                message: match err {
                    DnsEnsureError::MissingZone(message)
                    | DnsEnsureError::Conflict(message)
                    | DnsEnsureError::Upstream(message) => message,
                },
                zone_name: None,
                record_type: None,
                proxied: None,
                target: Some(target),
            };
        }
    };

    match fetch_dns_records(client, config, &zone, hostname).await {
        Ok(records) => dns_status_from_records(hostname, &zone, &target, &records),
        Err(err) => TunnelRouteDns {
            configured: false,
            status: "unknown".to_string(),
            message: match err {
                DnsEnsureError::MissingZone(message)
                | DnsEnsureError::Conflict(message)
                | DnsEnsureError::Upstream(message) => message,
            },
            zone_name: Some(zone.name),
            record_type: None,
            proxied: None,
            target: Some(target),
        },
    }
}

async fn annotate_dns_status(config: &CfConfig, routes: Vec<TunnelRoute>) -> Vec<TunnelRoute> {
    let client = cf_http_client();
    let mut annotated = Vec::with_capacity(routes.len());

    for mut route in routes {
        route.dns = Some(route_dns_status(&client, config, &route.hostname).await);
        annotated.push(route);
    }

    annotated
}

async fn create_dns_record(
    client: &reqwest::Client,
    config: &CfConfig,
    zone: &CfZone,
    hostname: &str,
    target: &str,
) -> Result<(), DnsEnsureError> {
    let url = format!("{}/zones/{}/dns_records", cf_api_base(), zone.id);
    let body = serde_json::json!({
        "type": "CNAME",
        "name": hostname,
        "content": target,
        "ttl": 1,
        "proxied": true,
    });

    let resp = client
        .post(&url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            DnsEnsureError::Upstream(format!(
                "Unable to create Cloudflare DNS record for '{hostname}': {e}"
            ))
        })?;

    let status = resp.status();
    let body: CfItemResponse<CfDnsRecord> = resp.json().await.map_err(|e| {
        DnsEnsureError::Upstream(format!(
            "Unable to parse Cloudflare DNS create response for '{hostname}': {e}"
        ))
    })?;

    if !status.is_success() || !body.success {
        return Err(DnsEnsureError::Upstream(format!(
            "Cloudflare could not create the DNS record for '{hostname}': {}. Create a proxied CNAME for {hostname} to {target}.",
            cf_error_message(&body.errors, &status.to_string())
        )));
    }

    let _ = body.result;
    Ok(())
}

async fn update_dns_record_to_proxied(
    client: &reqwest::Client,
    config: &CfConfig,
    zone: &CfZone,
    record: &CfDnsRecord,
    hostname: &str,
    target: &str,
) -> Result<(), DnsEnsureError> {
    let url = format!(
        "{}/zones/{}/dns_records/{}",
        cf_api_base(),
        zone.id,
        record.id
    );
    let body = serde_json::json!({
        "type": "CNAME",
        "name": hostname,
        "content": target,
        "ttl": 1,
        "proxied": true,
    });

    let resp = client
        .put(&url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            DnsEnsureError::Upstream(format!(
                "Unable to update Cloudflare DNS record for '{hostname}': {e}"
            ))
        })?;

    let status = resp.status();
    let body: CfItemResponse<CfDnsRecord> = resp.json().await.map_err(|e| {
        DnsEnsureError::Upstream(format!(
            "Unable to parse Cloudflare DNS update response for '{hostname}': {e}"
        ))
    })?;

    if !status.is_success() || !body.success {
        return Err(DnsEnsureError::Upstream(format!(
            "Cloudflare could not update the DNS record for '{hostname}': {}. Ensure the API token has DNS:Edit permission for '{}'.",
            cf_error_message(&body.errors, &status.to_string()),
            zone.name
        )));
    }

    let _ = body.result;
    Ok(())
}

async fn ensure_route_dns(config: &CfConfig, hostname: &str) -> Result<(), DnsEnsureError> {
    let client = cf_http_client();
    let target = tunnel_dns_target(config);
    let zone = find_managed_zone(&client, config, hostname).await?.ok_or_else(|| {
        DnsEnsureError::MissingZone(format!(
            "No managed Cloudflare zone was found for {hostname}. Add the zone to Cloudflare or create a proxied CNAME for {hostname} to {target} before creating this tunnel route."
        ))
    })?;
    let records = fetch_dns_records(&client, config, &zone, hostname).await?;

    if records.is_empty() {
        create_dns_record(&client, config, &zone, hostname, &target).await?;
        return Ok(());
    }

    if let Some(record) = matching_cname(&records, &target) {
        if record.proxied.unwrap_or(false) {
            return Ok(());
        }
        update_dns_record_to_proxied(&client, config, &zone, record, hostname, &target).await?;
        return Ok(());
    }

    let record = &records[0];
    Err(DnsEnsureError::Conflict(format!(
        "{hostname} already has a conflicting Cloudflare DNS record: {} {} -> '{}'. Replace it with a proxied CNAME to {target}.",
        record.record_type, record.name, record.content
    )))
}

/// Write ingress routes back to the Cloudflare Tunnel configuration.
///
/// This rebuilds the full ingress array (user routes + catch-all) and PUTs
/// it to the Cloudflare API.
async fn write_ingress_routes(config: &CfConfig, routes: &[TunnelRoute]) -> anyhow::Result<()> {
    let client = cf_http_client();
    let url = format!(
        "{}/accounts/{}/cfd_tunnel/{}/configurations",
        cf_api_base(),
        config.account_id,
        config.tunnel_id
    );

    // Build ingress array: user routes + catch-all.
    let mut ingress: Vec<serde_json::Value> = routes
        .iter()
        .map(|r| {
            let mut entry = serde_json::json!({
                "hostname": r.hostname,
                "service": r.service,
            });
            if let Some(path) = normalize_path_matcher(r.path.clone()) {
                entry["path"] = serde_json::json!(path);
            }
            entry
        })
        .collect();

    // The catch-all rule must always be last.
    ingress.push(serde_json::json!({
        "service": "http_status:404"
    }));

    let body = serde_json::json!({
        "config": {
            "ingress": ingress
        }
    });

    let resp = client
        .put(&url)
        .bearer_auth(&config.api_token)
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("Cloudflare API returned HTTP {status}: {text}");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zone() -> CfZone {
        CfZone {
            id: "zone-1".to_string(),
            name: "oklabs.uk".to_string(),
        }
    }

    fn record(record_type: &str, content: &str, proxied: Option<bool>) -> CfDnsRecord {
        CfDnsRecord {
            id: "record-1".to_string(),
            record_type: record_type.to_string(),
            name: "scribe.oklabs.uk".to_string(),
            content: content.to_string(),
            proxied,
        }
    }

    #[test]
    fn normalizes_empty_and_root_path_matchers() {
        assert_eq!(normalize_path_matcher(None), None);
        assert_eq!(normalize_path_matcher(Some(String::new())), None);
        assert_eq!(normalize_path_matcher(Some("   ".to_string())), None);
        assert_eq!(normalize_path_matcher(Some("/".to_string())), None);
        assert_eq!(normalize_path_matcher(Some(" / ".to_string())), None);
    }

    #[test]
    fn preserves_specific_path_matchers() {
        assert_eq!(
            normalize_path_matcher(Some("/api".to_string())),
            Some("/api".to_string())
        );
        assert_eq!(
            normalize_path_matcher(Some(" ^/api ".to_string())),
            Some("^/api".to_string())
        );
    }

    #[test]
    fn cloudflare_tunnel_dns_candidates_include_parent_zones() {
        assert_eq!(
            hostname_zone_candidates("scribe.oklabs.uk"),
            vec!["scribe.oklabs.uk", "oklabs.uk"]
        );
    }

    #[test]
    fn cloudflare_tunnel_dns_accepts_existing_proxied_cname() {
        let status = dns_status_from_records(
            "scribe.oklabs.uk",
            &zone(),
            "abc.cfargotunnel.com",
            &[record("CNAME", "abc.cfargotunnel.com.", Some(true))],
        );

        assert!(status.configured);
        assert_eq!(status.status, "configured");
    }

    #[test]
    fn cloudflare_tunnel_dns_marks_unproxied_cname_not_configured() {
        let status = dns_status_from_records(
            "scribe.oklabs.uk",
            &zone(),
            "abc.cfargotunnel.com",
            &[record("CNAME", "abc.cfargotunnel.com", Some(false))],
        );

        assert!(!status.configured);
        assert_eq!(status.status, "unproxied");
    }

    #[test]
    fn cloudflare_tunnel_dns_reports_conflicting_record() {
        let status = dns_status_from_records(
            "scribe.oklabs.uk",
            &zone(),
            "abc.cfargotunnel.com",
            &[record("A", "203.0.113.10", None)],
        );

        assert!(!status.configured);
        assert_eq!(status.status, "conflict");
        assert!(status.message.contains("proxied CNAME"));
    }

    #[test]
    fn cloudflare_tunnel_dns_reports_missing_record_action() {
        let status =
            dns_status_from_records("scribe.oklabs.uk", &zone(), "abc.cfargotunnel.com", &[]);

        assert!(!status.configured);
        assert_eq!(status.status, "missing");
        assert!(status.message.contains("Create a proxied CNAME"));
    }
}
