use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

use super::error::AppError;
use super::AppState;
use crate::npm::client::{
    NpmAccessListClientPayload, NpmAccessListPayload, NpmCertificate, NpmClient,
    NpmConnectionStatus, NpmDeadHostPayload, NpmProxyHostPayload, NpmRedirectionHostPayload,
    NpmStreamPayload,
};

/// GET /api/v1/npm/status — check NPM connection health.
///
/// Returns whether NPM is configured and reachable, plus the number
/// of proxy hosts as a quick health signal.
pub async fn status(State(state): State<AppState>) -> Json<NpmConnectionStatus> {
    let client = match get_npm_client(&state).await {
        Some(c) => c,
        None => {
            return Json(NpmConnectionStatus {
                configured: false,
                reachable: false,
                host_count: None,
            });
        }
    };

    match client.test_connection().await {
        Ok(status) => Json(status),
        Err(e) => {
            error!("NPM connection test failed: {e}");
            Json(NpmConnectionStatus {
                configured: true,
                reachable: false,
                host_count: None,
            })
        }
    }
}

/// Response for the proxy hosts list endpoint.
#[derive(Debug, Serialize)]
pub struct ProxyHostSummary {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub ssl_forced: bool,
    pub certificate_id: Option<serde_json::Value>,
    pub access_list_id: serde_json::Value,
    pub hsts_enabled: bool,
    pub http2_support: bool,
    pub block_exploits: bool,
    pub allow_websocket_upgrade: bool,
    pub advanced_config: Option<String>,
}

/// GET /api/v1/npm/proxy-hosts — list all proxy hosts from NPM.
pub async fn proxy_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProxyHostSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let hosts = client.list_proxy_hosts().await.map_err(|e| {
        error!("NPM list proxy hosts failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<ProxyHostSummary> = hosts
        .into_iter()
        .map(|h| ProxyHostSummary {
            id: h.id,
            domain_names: h.domain_names,
            forward_host: h.forward_host,
            forward_port: h.forward_port,
            forward_scheme: h.forward_scheme,
            enabled: h.enabled,
            ssl_forced: h.ssl_forced,
            certificate_id: h.certificate_id,
            access_list_id: h.access_list_id,
            hsts_enabled: h.hsts_enabled,
            http2_support: h.http2_support,
            block_exploits: h.block_exploits,
            allow_websocket_upgrade: h.allow_websocket_upgrade,
            advanced_config: h.advanced_config,
        })
        .collect();

    Ok(Json(summaries))
}

// ─── Proxy Hosts ────────────────────────────────────────

/// Request body for creating / updating a proxy host.
#[derive(Debug, Deserialize)]
pub struct ProxyHostRequest {
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    #[serde(default = "default_scheme")]
    pub forward_scheme: String,
    #[serde(default)]
    pub certificate_id: serde_json::Value,
    #[serde(default = "default_access_list_id")]
    pub access_list_id: serde_json::Value,
    #[serde(default)]
    pub ssl_forced: bool,
    #[serde(default)]
    pub hsts_enabled: bool,
    #[serde(default)]
    pub http2_support: bool,
    #[serde(default)]
    pub block_exploits: bool,
    #[serde(default)]
    pub allow_websocket_upgrade: bool,
    #[serde(default)]
    pub advanced_config: String,
}

fn default_scheme() -> String {
    "http".to_string()
}

fn default_access_list_id() -> serde_json::Value {
    serde_json::Value::Number(0.into())
}

impl From<ProxyHostRequest> for NpmProxyHostPayload {
    fn from(r: ProxyHostRequest) -> Self {
        Self {
            domain_names: r.domain_names,
            forward_host: r.forward_host,
            forward_port: r.forward_port,
            forward_scheme: r.forward_scheme,
            certificate_id: r.certificate_id,
            access_list_id: r.access_list_id,
            ssl_forced: r.ssl_forced,
            hsts_enabled: r.hsts_enabled,
            http2_support: r.http2_support,
            block_exploits: r.block_exploits,
            allow_websocket_upgrade: r.allow_websocket_upgrade,
            advanced_config: r.advanced_config,
        }
    }
}

/// POST /api/v1/npm/proxy-hosts — create a new proxy host.
pub async fn create_proxy_host(
    State(state): State<AppState>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<ProxyHostSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload: NpmProxyHostPayload = body.into();
    let host = client.create_proxy_host(&payload).await.map_err(|e| {
        error!("NPM create proxy host failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(Json(ProxyHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_host: host.forward_host,
        forward_port: host.forward_port,
        forward_scheme: host.forward_scheme,
        enabled: host.enabled,
        ssl_forced: host.ssl_forced,
        certificate_id: host.certificate_id,
        access_list_id: host.access_list_id,
        hsts_enabled: host.hsts_enabled,
        http2_support: host.http2_support,
        block_exploits: host.block_exploits,
        allow_websocket_upgrade: host.allow_websocket_upgrade,
        advanced_config: host.advanced_config,
    }))
}

/// PUT /api/v1/npm/proxy-hosts/:id — update an existing proxy host.
pub async fn update_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ProxyHostRequest>,
) -> Result<Json<ProxyHostSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload: NpmProxyHostPayload = body.into();
    let host = client.update_proxy_host(id, &payload).await.map_err(|e| {
        error!("NPM update proxy host {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(Json(ProxyHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_host: host.forward_host,
        forward_port: host.forward_port,
        forward_scheme: host.forward_scheme,
        enabled: host.enabled,
        ssl_forced: host.ssl_forced,
        certificate_id: host.certificate_id,
        access_list_id: host.access_list_id,
        hsts_enabled: host.hsts_enabled,
        http2_support: host.http2_support,
        block_exploits: host.block_exploits,
        allow_websocket_upgrade: host.allow_websocket_upgrade,
        advanced_config: host.advanced_config,
    }))
}

/// DELETE /api/v1/npm/proxy-hosts/:id — delete a proxy host.
pub async fn delete_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_proxy_host(id).await.map_err(|e| {
        error!("NPM delete proxy host {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Request body for enable/disable toggle.
#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// POST /api/v1/npm/proxy-hosts/:id/toggle — enable or disable a proxy host.
pub async fn toggle_proxy_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ToggleRequest>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    if body.enabled {
        client.enable_proxy_host(id).await
    } else {
        client.disable_proxy_host(id).await
    }
    .map_err(|e| {
        error!("NPM toggle proxy host {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Redirection Hosts ──────────────────────────────────

/// Summary returned by the redirection hosts list endpoint.
#[derive(Debug, Serialize)]
pub struct RedirectionHostSummary {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    pub preserve_path: bool,
    pub ssl_forced: bool,
    pub block_exploits: bool,
    pub enabled: bool,
}

/// GET /api/v1/npm/redirection-hosts — list all redirection hosts from NPM.
pub async fn redirection_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<RedirectionHostSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let hosts = client.list_redirection_hosts().await.map_err(|e| {
        error!("NPM list redirection hosts failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<RedirectionHostSummary> = hosts
        .into_iter()
        .map(|h| RedirectionHostSummary {
            id: h.id,
            domain_names: h.domain_names,
            forward_http_code: h.forward_http_code,
            forward_scheme: h.forward_scheme,
            forward_domain_name: h.forward_domain_name,
            preserve_path: h.preserve_path,
            ssl_forced: h.ssl_forced,
            block_exploits: h.block_exploits,
            enabled: h.enabled,
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating / updating a redirection host.
#[derive(Debug, Deserialize)]
pub struct RedirectionHostRequest {
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    #[serde(default)]
    pub preserve_path: bool,
    #[serde(default)]
    pub ssl_forced: bool,
    #[serde(default)]
    pub block_exploits: bool,
    pub enabled: Option<bool>,
}

/// POST /api/v1/npm/redirection-hosts — create a new redirection host.
pub async fn create_redirection_host(
    State(state): State<AppState>,
    Json(body): Json<RedirectionHostRequest>,
) -> Result<Json<RedirectionHostSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmRedirectionHostPayload {
        domain_names: body.domain_names,
        forward_http_code: body.forward_http_code,
        forward_scheme: body.forward_scheme,
        forward_domain_name: body.forward_domain_name,
        preserve_path: body.preserve_path,
        certificate_id: serde_json::Value::Number(0.into()),
        ssl_forced: body.ssl_forced,
        block_exploits: body.block_exploits,
        enabled: body.enabled,
        meta: serde_json::json!({}),
    };

    let host = client
        .create_redirection_host(&payload)
        .await
        .map_err(|e| {
            error!("NPM create redirection host failed: {e}");
            AppError::BadGateway(e.to_string())
        })?;

    Ok(Json(RedirectionHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_http_code: host.forward_http_code,
        forward_scheme: host.forward_scheme,
        forward_domain_name: host.forward_domain_name,
        preserve_path: host.preserve_path,
        ssl_forced: host.ssl_forced,
        block_exploits: host.block_exploits,
        enabled: host.enabled,
    }))
}

/// PUT /api/v1/npm/redirection-hosts/:id — update a redirection host.
pub async fn update_redirection_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<RedirectionHostRequest>,
) -> Result<Json<RedirectionHostSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmRedirectionHostPayload {
        domain_names: body.domain_names,
        forward_http_code: body.forward_http_code,
        forward_scheme: body.forward_scheme,
        forward_domain_name: body.forward_domain_name,
        preserve_path: body.preserve_path,
        certificate_id: serde_json::Value::Number(0.into()),
        ssl_forced: body.ssl_forced,
        block_exploits: body.block_exploits,
        enabled: body.enabled,
        meta: serde_json::json!({}),
    };

    let host = client
        .update_redirection_host(id, &payload)
        .await
        .map_err(|e| {
            error!("NPM update redirection host {id} failed: {e}");
            AppError::BadGateway(e.to_string())
        })?;

    Ok(Json(RedirectionHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        forward_http_code: host.forward_http_code,
        forward_scheme: host.forward_scheme,
        forward_domain_name: host.forward_domain_name,
        preserve_path: host.preserve_path,
        ssl_forced: host.ssl_forced,
        block_exploits: host.block_exploits,
        enabled: host.enabled,
    }))
}

/// DELETE /api/v1/npm/redirection-hosts/:id — delete a redirection host.
pub async fn delete_redirection_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_redirection_host(id).await.map_err(|e| {
        error!("NPM delete redirection host {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── SSL Certificates ──────────────────────────────────────

/// Response for the certificate list — enriched with computed status.
#[derive(Debug, Serialize)]
pub struct CertificateSummary {
    pub id: i64,
    pub provider: String,
    pub nice_name: String,
    pub domain_names: Vec<String>,
    pub expires_on: Option<String>,
    pub created_on: Option<String>,
    /// "valid", "expiring" (< 30 days), or "expired"
    pub status: String,
    /// Days until expiry (negative = already expired).
    pub days_remaining: Option<i64>,
}

fn compute_cert_status(cert: &NpmCertificate) -> (String, Option<i64>) {
    let Some(ref expires_str) = cert.expires_on else {
        return ("unknown".to_string(), None);
    };
    let Ok(expires) = chrono::NaiveDate::parse_from_str(&expires_str[..10], "%Y-%m-%d") else {
        return ("unknown".to_string(), None);
    };
    let today = chrono::Utc::now().date_naive();
    let days = (expires - today).num_days();
    let status = if days < 0 {
        "expired"
    } else if days < 30 {
        "expiring"
    } else {
        "valid"
    };
    (status.to_string(), Some(days))
}

/// GET /api/v1/npm/certificates — list all SSL certificates.
pub async fn list_certificates(
    State(state): State<AppState>,
) -> Result<Json<Vec<CertificateSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let certs = client.list_certificates().await.map_err(|e| {
        error!("NPM list certificates failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<CertificateSummary> = certs
        .into_iter()
        .map(|c| {
            let (status, days_remaining) = compute_cert_status(&c);
            CertificateSummary {
                id: c.id,
                provider: c.provider,
                nice_name: c.nice_name,
                domain_names: c.domain_names,
                expires_on: c.expires_on,
                created_on: c.created_on,
                status,
                days_remaining,
            }
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating a Let's Encrypt certificate.
#[derive(Debug, Deserialize)]
pub struct CreateLetsEncryptRequest {
    pub domain_names: Vec<String>,
    pub email: String,
    #[serde(default)]
    pub dns_challenge: bool,
}

/// POST /api/v1/npm/certificates/letsencrypt — request a Let's Encrypt cert.
pub async fn create_letsencrypt(
    State(state): State<AppState>,
    Json(body): Json<CreateLetsEncryptRequest>,
) -> Result<Json<CertificateSummary>, AppError> {
    if body.domain_names.is_empty() {
        return Err(AppError::Validation("Domain names are required".into()));
    }
    let nice_name = body.domain_names.join(", ");

    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let cert = client
        .create_letsencrypt_cert(
            &nice_name,
            body.domain_names,
            &body.email,
            body.dns_challenge,
        )
        .await
        .map_err(|e| {
            error!("NPM create Let's Encrypt cert failed: {e}");
            AppError::BadGateway(e.to_string())
        })?;

    let (status, days_remaining) = compute_cert_status(&cert);
    Ok(Json(CertificateSummary {
        id: cert.id,
        provider: cert.provider,
        nice_name: cert.nice_name,
        domain_names: cert.domain_names,
        expires_on: cert.expires_on,
        created_on: cert.created_on,
        status,
        days_remaining,
    }))
}

/// Request body for uploading a custom certificate.
#[derive(Debug, Deserialize)]
pub struct UploadCustomCertRequest {
    pub nice_name: String,
    pub certificate: String,
    pub certificate_key: String,
}

/// POST /api/v1/npm/certificates/custom — upload a custom cert.
pub async fn upload_custom_cert(
    State(state): State<AppState>,
    Json(body): Json<UploadCustomCertRequest>,
) -> Result<Json<CertificateSummary>, AppError> {
    if body.certificate.is_empty() || body.certificate_key.is_empty() {
        return Err(AppError::Validation(
            "Certificate and certificate key are required".into(),
        ));
    }

    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let cert = client
        .upload_custom_cert(&body.nice_name, &body.certificate, &body.certificate_key)
        .await
        .map_err(|e| {
            error!("NPM upload custom cert failed: {e}");
            AppError::BadGateway(e.to_string())
        })?;

    let (status, days_remaining) = compute_cert_status(&cert);
    Ok(Json(CertificateSummary {
        id: cert.id,
        provider: cert.provider,
        nice_name: cert.nice_name,
        domain_names: cert.domain_names,
        expires_on: cert.expires_on,
        created_on: cert.created_on,
        status,
        days_remaining,
    }))
}

/// POST /api/v1/npm/certificates/:id/renew — renew a certificate.
pub async fn renew_certificate(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<CertificateSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let cert = client.renew_certificate(id).await.map_err(|e| {
        error!("NPM renew certificate {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let (status, days_remaining) = compute_cert_status(&cert);
    Ok(Json(CertificateSummary {
        id: cert.id,
        provider: cert.provider,
        nice_name: cert.nice_name,
        domain_names: cert.domain_names,
        expires_on: cert.expires_on,
        created_on: cert.created_on,
        status,
        days_remaining,
    }))
}

/// DELETE /api/v1/npm/certificates/:id — delete a certificate.
pub async fn delete_certificate(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_certificate(id).await.map_err(|e| {
        error!("NPM delete certificate {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Streams (TCP/UDP proxies) ──────────────────────────

/// Summary returned by the streams list endpoint.
#[derive(Debug, Serialize)]
pub struct StreamSummary {
    pub id: i64,
    pub incoming_port: u16,
    pub forwarding_host: String,
    pub forwarding_port: u16,
    pub tcp_forwarding: bool,
    pub udp_forwarding: bool,
    pub enabled: bool,
}

/// GET /api/v1/npm/streams — list all streams from NPM.
pub async fn list_streams(
    State(state): State<AppState>,
) -> Result<Json<Vec<StreamSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let streams = client.list_streams().await.map_err(|e| {
        error!("NPM list streams failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<StreamSummary> = streams
        .into_iter()
        .map(|s| StreamSummary {
            id: s.id,
            incoming_port: s.incoming_port,
            forwarding_host: s.forwarding_host,
            forwarding_port: s.forwarding_port,
            tcp_forwarding: s.tcp_forwarding,
            udp_forwarding: s.udp_forwarding,
            enabled: s.enabled,
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating / updating a stream.
#[derive(Debug, Deserialize)]
pub struct StreamRequest {
    pub incoming_port: u16,
    pub forwarding_host: String,
    pub forwarding_port: u16,
    #[serde(default = "default_true")]
    pub tcp_forwarding: bool,
    #[serde(default)]
    pub udp_forwarding: bool,
}

fn default_true() -> bool {
    true
}

/// POST /api/v1/npm/streams — create a new stream.
pub async fn create_stream(
    State(state): State<AppState>,
    Json(body): Json<StreamRequest>,
) -> Result<Json<StreamSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmStreamPayload {
        incoming_port: body.incoming_port,
        forwarding_host: body.forwarding_host,
        forwarding_port: body.forwarding_port,
        tcp_forwarding: body.tcp_forwarding,
        udp_forwarding: body.udp_forwarding,
        meta: serde_json::json!({}),
    };

    let stream = client.create_stream(&payload).await.map_err(|e| {
        error!("NPM create stream failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(Json(StreamSummary {
        id: stream.id,
        incoming_port: stream.incoming_port,
        forwarding_host: stream.forwarding_host,
        forwarding_port: stream.forwarding_port,
        tcp_forwarding: stream.tcp_forwarding,
        udp_forwarding: stream.udp_forwarding,
        enabled: stream.enabled,
    }))
}

/// PUT /api/v1/npm/streams/:id — update a stream.
pub async fn update_stream(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<StreamRequest>,
) -> Result<Json<StreamSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmStreamPayload {
        incoming_port: body.incoming_port,
        forwarding_host: body.forwarding_host,
        forwarding_port: body.forwarding_port,
        tcp_forwarding: body.tcp_forwarding,
        udp_forwarding: body.udp_forwarding,
        meta: serde_json::json!({}),
    };

    let stream = client.update_stream(id, &payload).await.map_err(|e| {
        error!("NPM update stream {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(Json(StreamSummary {
        id: stream.id,
        incoming_port: stream.incoming_port,
        forwarding_host: stream.forwarding_host,
        forwarding_port: stream.forwarding_port,
        tcp_forwarding: stream.tcp_forwarding,
        udp_forwarding: stream.udp_forwarding,
        enabled: stream.enabled,
    }))
}

/// DELETE /api/v1/npm/streams/:id — delete a stream.
pub async fn delete_stream(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_stream(id).await.map_err(|e| {
        error!("NPM delete stream {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/npm/streams/:id/toggle — enable or disable a stream.
pub async fn toggle_stream(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<ToggleRequest>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    if body.enabled {
        client.enable_stream(id).await
    } else {
        client.disable_stream(id).await
    }
    .map_err(|e| {
        error!("NPM toggle stream {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Dead Hosts ─────────────────────────────────────────

/// Summary returned by the dead hosts list endpoint.
#[derive(Debug, Serialize)]
pub struct DeadHostSummary {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub ssl_forced: bool,
    pub enabled: bool,
}

/// GET /api/v1/npm/dead-hosts — list all dead hosts from NPM.
pub async fn dead_hosts(
    State(state): State<AppState>,
) -> Result<Json<Vec<DeadHostSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let hosts = client.list_dead_hosts().await.map_err(|e| {
        error!("NPM list dead hosts failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<DeadHostSummary> = hosts
        .into_iter()
        .map(|h| DeadHostSummary {
            id: h.id,
            domain_names: h.domain_names,
            ssl_forced: h.ssl_forced,
            enabled: h.enabled,
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating a dead host.
#[derive(Debug, Deserialize)]
pub struct DeadHostRequest {
    pub domain_names: Vec<String>,
    #[serde(default)]
    pub ssl_forced: bool,
}

/// POST /api/v1/npm/dead-hosts — create a new dead host.
pub async fn create_dead_host(
    State(state): State<AppState>,
    Json(body): Json<DeadHostRequest>,
) -> Result<Json<DeadHostSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmDeadHostPayload {
        domain_names: body.domain_names,
        certificate_id: serde_json::Value::Number(0.into()),
        ssl_forced: body.ssl_forced,
        meta: serde_json::json!({}),
    };

    let host = client.create_dead_host(&payload).await.map_err(|e| {
        error!("NPM create dead host failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(Json(DeadHostSummary {
        id: host.id,
        domain_names: host.domain_names,
        ssl_forced: host.ssl_forced,
        enabled: host.enabled,
    }))
}

/// DELETE /api/v1/npm/dead-hosts/:id — delete a dead host.
pub async fn delete_dead_host(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_dead_host(id).await.map_err(|e| {
        error!("NPM delete dead host {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

// ─── Access Lists ───────────────────────────────────────

/// Summary returned by the access lists list endpoint.
#[derive(Debug, Serialize)]
pub struct AccessListSummary {
    pub id: i64,
    pub name: String,
    pub satisfy_any: bool,
    pub pass_auth: bool,
    pub clients: Vec<AccessListClientSummary>,
    pub client_count: usize,
    pub created_on: Option<String>,
    pub modified_on: Option<String>,
}

/// Single IP-based client entry in an access list.
#[derive(Debug, Serialize)]
pub struct AccessListClientSummary {
    pub address: String,
    pub directive: String,
}

/// GET /api/v1/npm/access-lists — list all access lists.
pub async fn list_access_lists(
    State(state): State<AppState>,
) -> Result<Json<Vec<AccessListSummary>>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let lists = client.list_access_lists().await.map_err(|e| {
        error!("NPM list access lists failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let summaries: Vec<AccessListSummary> = lists
        .into_iter()
        .map(|al| {
            let client_count = al.clients.len();
            AccessListSummary {
                id: al.id,
                name: al.name,
                satisfy_any: al.satisfy_any,
                pass_auth: al.pass_auth,
                clients: al
                    .clients
                    .into_iter()
                    .map(|c| AccessListClientSummary {
                        address: c.address,
                        directive: c.directive,
                    })
                    .collect(),
                client_count,
                created_on: al.created_on,
                modified_on: al.modified_on,
            }
        })
        .collect();

    Ok(Json(summaries))
}

/// Request body for creating / updating an access list.
#[derive(Debug, Deserialize)]
pub struct AccessListRequest {
    pub name: String,
    #[serde(default)]
    pub satisfy_any: bool,
    #[serde(default)]
    pub pass_auth: bool,
    #[serde(default)]
    pub clients: Vec<AccessListClientRequest>,
}

/// Single client entry in the access list request body.
#[derive(Debug, Deserialize)]
pub struct AccessListClientRequest {
    pub address: String,
    pub directive: String,
}

/// POST /api/v1/npm/access-lists — create a new access list.
pub async fn create_access_list(
    State(state): State<AppState>,
    Json(body): Json<AccessListRequest>,
) -> Result<Json<AccessListSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmAccessListPayload {
        name: body.name,
        satisfy_any: body.satisfy_any,
        pass_auth: body.pass_auth,
        items: vec![],
        clients: body
            .clients
            .into_iter()
            .map(|c| NpmAccessListClientPayload {
                address: c.address,
                directive: c.directive,
            })
            .collect(),
    };

    let al = client.create_access_list(&payload).await.map_err(|e| {
        error!("NPM create access list failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let client_count = al.clients.len();
    Ok(Json(AccessListSummary {
        id: al.id,
        name: al.name,
        satisfy_any: al.satisfy_any,
        pass_auth: al.pass_auth,
        clients: al
            .clients
            .into_iter()
            .map(|c| AccessListClientSummary {
                address: c.address,
                directive: c.directive,
            })
            .collect(),
        client_count,
        created_on: al.created_on,
        modified_on: al.modified_on,
    }))
}

/// PUT /api/v1/npm/access-lists/:id — update an access list.
pub async fn update_access_list(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(body): Json<AccessListRequest>,
) -> Result<Json<AccessListSummary>, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    let payload = NpmAccessListPayload {
        name: body.name,
        satisfy_any: body.satisfy_any,
        pass_auth: body.pass_auth,
        items: vec![],
        clients: body
            .clients
            .into_iter()
            .map(|c| NpmAccessListClientPayload {
                address: c.address,
                directive: c.directive,
            })
            .collect(),
    };

    let al = client.update_access_list(id, &payload).await.map_err(|e| {
        error!("NPM update access list {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    let client_count = al.clients.len();
    Ok(Json(AccessListSummary {
        id: al.id,
        name: al.name,
        satisfy_any: al.satisfy_any,
        pass_auth: al.pass_auth,
        clients: al
            .clients
            .into_iter()
            .map(|c| AccessListClientSummary {
                address: c.address,
                directive: c.directive,
            })
            .collect(),
        client_count,
        created_on: al.created_on,
        modified_on: al.modified_on,
    }))
}

/// DELETE /api/v1/npm/access-lists/:id — delete an access list.
pub async fn delete_access_list(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, AppError> {
    let client = get_npm_client(&state)
        .await
        .ok_or(AppError::ServiceUnavailable("NPM not configured".into()))?;

    client.delete_access_list(id).await.map_err(|e| {
        error!("NPM delete access list {id} failed: {e}");
        AppError::BadGateway(e.to_string())
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// Build an [`NpmClient`] from current settings, or `None` if not configured.
async fn get_npm_client(state: &AppState) -> Option<NpmClient> {
    let url = get_setting(state, "npm_url").await?;
    let email = get_setting(state, "npm_email").await?;
    let password = get_setting(state, "npm_password").await?;

    Some(NpmClient::new(
        &url,
        &email,
        &password,
        state.npm_http.clone(),
    ))
}

/// Helper: read a string setting from the settings table.
async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}
