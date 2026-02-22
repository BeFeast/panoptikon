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
    pub meta: Option<serde_json::Value>,
}

/// Connection test result returned by the `/npm/status` endpoint.
#[derive(Debug, Serialize)]
pub struct NpmConnectionStatus {
    pub configured: bool,
    pub reachable: bool,
    pub host_count: Option<usize>,
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
