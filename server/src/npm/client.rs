//! Nginx Proxy Manager HTTP API client.
//!
//! Handles token-based authentication with auto-renewal.
//! NPM uses `POST /api/tokens` to obtain a bearer token that expires
//! after ~1 day. This client caches the token and re-authenticates
//! before expiry.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Cached bearer token with its creation time.
#[derive(Debug, Clone)]
struct CachedToken {
    token: String,
    obtained_at: Instant,
}

/// Shared token cache across clones of [`NpmClient`].
#[derive(Debug, Clone, Default)]
pub struct NpmTokenCache {
    inner: Arc<RwLock<Option<CachedToken>>>,
}

/// A client for the Nginx Proxy Manager API.
#[derive(Debug, Clone)]
pub struct NpmClient {
    base_url: String,
    email: String,
    password: String,
    http: reqwest::Client,
    token_cache: NpmTokenCache,
}

/// Response from `POST /api/tokens`.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    token: String,
    // NPM returns `expires` as an ISO date string; we ignore it and use
    // a conservative 20-hour TTL to avoid clock-drift issues.
}

/// NPM proxy host (subset of fields relevant to Panoptikon).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmProxyHost {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub ssl_forced: bool,
    pub certificate_id: Option<serde_json::Value>,
    pub hsts_enabled: bool,
    pub http2_support: bool,
    pub block_exploits: bool,
    pub allow_websocket_upgrade: bool,
    pub advanced_config: Option<String>,
    pub meta: Option<serde_json::Value>,
}

/// Payload for creating or updating a proxy host.
#[derive(Debug, Serialize, Clone)]
pub struct NpmProxyHostPayload {
    pub domain_names: Vec<String>,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub certificate_id: serde_json::Value,
    pub ssl_forced: bool,
    pub hsts_enabled: bool,
    pub http2_support: bool,
    pub block_exploits: bool,
    pub allow_websocket_upgrade: bool,
    pub advanced_config: String,
}

/// NPM redirection host returned by the API.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmRedirectionHost {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    pub preserve_path: bool,
    pub certificate_id: serde_json::Value,
    pub ssl_forced: bool,
    pub block_exploits: bool,
    pub enabled: bool,
    pub meta: Option<serde_json::Value>,
}

/// Payload for creating / updating a redirection host.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmRedirectionHostPayload {
    pub domain_names: Vec<String>,
    pub forward_http_code: u16,
    pub forward_scheme: String,
    pub forward_domain_name: String,
    pub preserve_path: bool,
    pub certificate_id: serde_json::Value,
    pub ssl_forced: bool,
    pub block_exploits: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    pub meta: serde_json::Value,
}

/// NPM stream (TCP/UDP proxy) returned by the API.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmStream {
    pub id: i64,
    pub incoming_port: u16,
    pub forwarding_host: String,
    pub forwarding_port: u16,
    #[serde(default)]
    pub tcp_forwarding: bool,
    #[serde(default)]
    pub udp_forwarding: bool,
    pub enabled: bool,
    pub meta: Option<serde_json::Value>,
}

/// Payload for creating / updating a stream.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmStreamPayload {
    pub incoming_port: u16,
    pub forwarding_host: String,
    pub forwarding_port: u16,
    pub tcp_forwarding: bool,
    pub udp_forwarding: bool,
    pub meta: serde_json::Value,
}

/// NPM dead host returned by the API.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmDeadHost {
    pub id: i64,
    pub domain_names: Vec<String>,
    pub certificate_id: serde_json::Value,
    pub ssl_forced: bool,
    pub enabled: bool,
    pub meta: Option<serde_json::Value>,
}

/// Payload for creating a dead host.
#[derive(Debug, Serialize, Clone)]
pub struct NpmDeadHostPayload {
    pub domain_names: Vec<String>,
    pub certificate_id: serde_json::Value,
    pub ssl_forced: bool,
    pub meta: serde_json::Value,
}

/// Connection test result returned by the `/npm/status` endpoint.
#[derive(Debug, Serialize)]
pub struct NpmConnectionStatus {
    pub configured: bool,
    pub reachable: bool,
    pub host_count: Option<usize>,
}

/// NPM SSL certificate as returned by the API.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NpmCertificate {
    pub id: i64,
    #[serde(default)]
    pub provider: String,
    pub nice_name: String,
    #[serde(default)]
    pub domain_names: Vec<String>,
    pub expires_on: Option<String>,
    pub created_on: Option<String>,
    pub modified_on: Option<String>,
    pub meta: Option<serde_json::Value>,
}

/// Request body for creating a Let's Encrypt certificate.
#[derive(Debug, Serialize)]
pub struct CreateLetsEncryptCertRequest {
    pub provider: &'static str,
    pub nice_name: String,
    pub domain_names: Vec<String>,
    pub meta: LetsEncryptMeta,
}

/// Meta fields for Let's Encrypt cert request.
#[derive(Debug, Serialize)]
pub struct LetsEncryptMeta {
    pub letsencrypt_email: String,
    pub letsencrypt_agree: bool,
    pub dns_challenge: bool,
}

/// Request body for uploading a custom certificate.
#[derive(Debug, Serialize)]
pub struct CreateCustomCertRequest {
    pub provider: &'static str,
    pub nice_name: String,
    pub certificate: String,
    pub certificate_key: String,
}

/// Build the shared `reqwest::Client` for NPM API calls.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(4)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .expect("failed to build shared reqwest client for NPM")
}

impl NpmClient {
    /// Create a new NPM client.
    ///
    /// `base_url` should include scheme + host + port, e.g. `"http://10.10.0.20:81"`.
    pub fn new(base_url: &str, email: &str, password: &str, http: reqwest::Client) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            email: email.to_string(),
            password: password.to_string(),
            http,
            token_cache: NpmTokenCache::default(),
        }
    }

    /// Authenticate and obtain a fresh bearer token.
    async fn authenticate(&self) -> Result<String> {
        #[derive(Serialize)]
        struct TokenRequest<'a> {
            identity: &'a str,
            secret: &'a str,
        }

        let url = format!("{}/api/tokens", self.base_url);
        let resp = self
            .http
            .post(&url)
            .json(&TokenRequest {
                identity: &self.email,
                secret: &self.password,
            })
            .send()
            .await
            .context("NPM token request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM auth failed (HTTP {status}): {body}");
        }

        let parsed: TokenResponse = resp
            .json()
            .await
            .context("failed to parse NPM token response")?;

        Ok(parsed.token)
    }

    /// Get a valid bearer token, re-authenticating if needed.
    ///
    /// Tokens are considered valid for 20 hours (NPM default expiry is 1 day).
    async fn get_token(&self) -> Result<String> {
        const TOKEN_TTL: Duration = Duration::from_secs(20 * 3600);

        // Try cached token first.
        {
            let guard = self.token_cache.inner.read().await;
            if let Some(ref cached) = *guard {
                if cached.obtained_at.elapsed() < TOKEN_TTL {
                    return Ok(cached.token.clone());
                }
            }
        }

        // Re-authenticate.
        let token = self.authenticate().await?;

        // Cache the new token.
        {
            let mut guard = self.token_cache.inner.write().await;
            *guard = Some(CachedToken {
                token: token.clone(),
                obtained_at: Instant::now(),
            });
        }

        Ok(token)
    }

    /// List all proxy hosts.
    pub async fn list_proxy_hosts(&self) -> Result<Vec<NpmProxyHost>> {
        let token = self.get_token().await?;
        let url = format!(
            "{}/api/nginx/proxy-hosts?expand=certificate,owner,access_list",
            self.base_url
        );

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM list proxy hosts request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM list proxy hosts failed (HTTP {status}): {body}");
        }

        let hosts: Vec<NpmProxyHost> = resp
            .json()
            .await
            .context("failed to parse NPM proxy hosts response")?;

        Ok(hosts)
    }

    /// Create a new proxy host.
    pub async fn create_proxy_host(&self, payload: &NpmProxyHostPayload) -> Result<NpmProxyHost> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/proxy-hosts", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM create proxy host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM create proxy host failed (HTTP {status}): {body}");
        }

        resp.json()
            .await
            .context("failed to parse NPM create proxy host response")
    }

    /// Update an existing proxy host.
    pub async fn update_proxy_host(
        &self,
        id: i64,
        payload: &NpmProxyHostPayload,
    ) -> Result<NpmProxyHost> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/proxy-hosts/{}", self.base_url, id);

        let resp = self
            .http
            .put(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM update proxy host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM update proxy host failed (HTTP {status}): {body}");
        }

        resp.json()
            .await
            .context("failed to parse NPM update proxy host response")
    }

    /// Delete a proxy host by ID.
    pub async fn delete_proxy_host(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/proxy-hosts/{}", self.base_url, id);

        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM delete proxy host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM delete proxy host failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// Enable a proxy host.
    pub async fn enable_proxy_host(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/proxy-hosts/{}/enable", self.base_url, id);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM enable proxy host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM enable proxy host failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// Disable a proxy host.
    pub async fn disable_proxy_host(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/proxy-hosts/{}/disable", self.base_url, id);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM disable proxy host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM disable proxy host failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// List all redirection hosts.
    pub async fn list_redirection_hosts(&self) -> Result<Vec<NpmRedirectionHost>> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/redirection-hosts", self.base_url);

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM list redirection hosts request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM list redirection hosts failed (HTTP {status}): {body}");
        }

        let hosts: Vec<NpmRedirectionHost> = resp
            .json()
            .await
            .context("failed to parse NPM redirection hosts response")?;

        Ok(hosts)
    }

    /// Create a new redirection host.
    pub async fn create_redirection_host(
        &self,
        payload: &NpmRedirectionHostPayload,
    ) -> Result<NpmRedirectionHost> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/redirection-hosts", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM create redirection host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM create redirection host failed (HTTP {status}): {body}");
        }

        let host: NpmRedirectionHost = resp
            .json()
            .await
            .context("failed to parse NPM create redirection host response")?;

        Ok(host)
    }

    /// Update an existing redirection host.
    pub async fn update_redirection_host(
        &self,
        id: i64,
        payload: &NpmRedirectionHostPayload,
    ) -> Result<NpmRedirectionHost> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/redirection-hosts/{id}", self.base_url);

        let resp = self
            .http
            .put(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM update redirection host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM update redirection host failed (HTTP {status}): {body}");
        }

        let host: NpmRedirectionHost = resp
            .json()
            .await
            .context("failed to parse NPM update redirection host response")?;

        Ok(host)
    }

    /// Delete a redirection host by ID.
    pub async fn delete_redirection_host(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/redirection-hosts/{id}", self.base_url);

        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM delete redirection host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM delete redirection host failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// List all SSL certificates.
    pub async fn list_certificates(&self) -> Result<Vec<NpmCertificate>> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/certificates", self.base_url);

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM list certificates request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM list certificates failed (HTTP {status}): {body}");
        }

        let certs: Vec<NpmCertificate> = resp
            .json()
            .await
            .context("failed to parse NPM certificates response")?;

        Ok(certs)
    }

    /// Request a new Let's Encrypt certificate.
    pub async fn create_letsencrypt_cert(
        &self,
        nice_name: &str,
        domain_names: Vec<String>,
        email: &str,
        dns_challenge: bool,
    ) -> Result<NpmCertificate> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/certificates", self.base_url);

        let body = CreateLetsEncryptCertRequest {
            provider: "letsencrypt",
            nice_name: nice_name.to_string(),
            domain_names,
            meta: LetsEncryptMeta {
                letsencrypt_email: email.to_string(),
                letsencrypt_agree: true,
                dns_challenge,
            },
        };

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .context("NPM create Let's Encrypt certificate request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM create Let's Encrypt cert failed (HTTP {status}): {body}");
        }

        let cert: NpmCertificate = resp
            .json()
            .await
            .context("failed to parse NPM create cert response")?;

        Ok(cert)
    }

    /// Upload a custom certificate (PEM cert + key).
    pub async fn upload_custom_cert(
        &self,
        nice_name: &str,
        certificate: &str,
        certificate_key: &str,
    ) -> Result<NpmCertificate> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/certificates", self.base_url);

        let body = CreateCustomCertRequest {
            provider: "other",
            nice_name: nice_name.to_string(),
            certificate: certificate.to_string(),
            certificate_key: certificate_key.to_string(),
        };

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .context("NPM upload custom certificate request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM upload custom cert failed (HTTP {status}): {body}");
        }

        let cert: NpmCertificate = resp
            .json()
            .await
            .context("failed to parse NPM upload cert response")?;

        Ok(cert)
    }

    /// Renew a certificate by ID.
    pub async fn renew_certificate(&self, cert_id: i64) -> Result<NpmCertificate> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/certificates/{}/renew", self.base_url, cert_id);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM renew certificate request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM renew certificate failed (HTTP {status}): {body}");
        }

        let cert: NpmCertificate = resp
            .json()
            .await
            .context("failed to parse NPM renew cert response")?;

        Ok(cert)
    }

    /// Delete a certificate by ID.
    pub async fn delete_certificate(&self, cert_id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/certificates/{}", self.base_url, cert_id);

        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM delete certificate request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM delete certificate failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    // ─── Streams (TCP/UDP proxies) ─────────────────────────

    /// List all streams.
    pub async fn list_streams(&self) -> Result<Vec<NpmStream>> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams", self.base_url);

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM list streams request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM list streams failed (HTTP {status}): {body}");
        }

        let streams: Vec<NpmStream> = resp
            .json()
            .await
            .context("failed to parse NPM streams response")?;

        Ok(streams)
    }

    /// Create a new stream.
    pub async fn create_stream(&self, payload: &NpmStreamPayload) -> Result<NpmStream> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM create stream request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM create stream failed (HTTP {status}): {body}");
        }

        resp.json()
            .await
            .context("failed to parse NPM create stream response")
    }

    /// Update an existing stream.
    pub async fn update_stream(&self, id: i64, payload: &NpmStreamPayload) -> Result<NpmStream> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams/{id}", self.base_url);

        let resp = self
            .http
            .put(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM update stream request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM update stream failed (HTTP {status}): {body}");
        }

        resp.json()
            .await
            .context("failed to parse NPM update stream response")
    }

    /// Delete a stream by ID.
    pub async fn delete_stream(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams/{id}", self.base_url);

        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM delete stream request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM delete stream failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// Enable a stream.
    pub async fn enable_stream(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams/{id}/enable", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM enable stream request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM enable stream failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// Disable a stream.
    pub async fn disable_stream(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/streams/{id}/disable", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM disable stream request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM disable stream failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    // ─── Dead Hosts ─────────────────────────────────────────

    /// List all dead hosts.
    pub async fn list_dead_hosts(&self) -> Result<Vec<NpmDeadHost>> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/dead-hosts", self.base_url);

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM list dead hosts request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM list dead hosts failed (HTTP {status}): {body}");
        }

        let hosts: Vec<NpmDeadHost> = resp
            .json()
            .await
            .context("failed to parse NPM dead hosts response")?;

        Ok(hosts)
    }

    /// Create a new dead host.
    pub async fn create_dead_host(&self, payload: &NpmDeadHostPayload) -> Result<NpmDeadHost> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/dead-hosts", self.base_url);

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(payload)
            .send()
            .await
            .context("NPM create dead host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM create dead host failed (HTTP {status}): {body}");
        }

        let host: NpmDeadHost = resp
            .json()
            .await
            .context("failed to parse NPM create dead host response")?;

        Ok(host)
    }

    /// Delete a dead host by ID.
    pub async fn delete_dead_host(&self, id: i64) -> Result<()> {
        let token = self.get_token().await?;
        let url = format!("{}/api/nginx/dead-hosts/{id}", self.base_url);

        let resp = self
            .http
            .delete(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM delete dead host request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM delete dead host failed (HTTP {status}): {body}");
        }

        Ok(())
    }

    /// Test the connection by authenticating and fetching proxy hosts.
    ///
    /// Returns the number of proxy hosts as a health signal.
    pub async fn test_connection(&self) -> Result<NpmConnectionStatus> {
        // Force re-auth to verify credentials are still valid.
        let token = self.authenticate().await?;

        // Cache the fresh token.
        {
            let mut guard = self.token_cache.inner.write().await;
            *guard = Some(CachedToken {
                token: token.clone(),
                obtained_at: Instant::now(),
            });
        }

        let url = format!(
            "{}/api/nginx/proxy-hosts?expand=certificate,owner,access_list",
            self.base_url
        );

        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await
            .context("NPM proxy hosts request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("NPM proxy hosts failed (HTTP {status}): {body}");
        }

        let hosts: Vec<NpmProxyHost> = resp
            .json()
            .await
            .context("failed to parse NPM proxy hosts")?;

        Ok(NpmConnectionStatus {
            configured: true,
            reachable: true,
            host_count: Some(hosts.len()),
        })
    }
}
