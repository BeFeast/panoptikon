//! Xiaomi MiWiFi API client.
//!
//! Communicates with a Xiaomi router using its HTTP-based MiWiFi API.
//! Auth is via a `stok` token obtained by logging in with password.

use anyhow::{Context, Result};
use dashmap::DashMap;
use serde_json::Value;
use std::time::{Duration, Instant};

use super::types::*;

/// Default TTL for cached responses (30 seconds, matching other router caches).
const CACHE_TTL: Duration = Duration::from_secs(30);

/// Build the shared `reqwest::Client` for Xiaomi MiWiFi API calls.
///
/// Xiaomi routers use plain HTTP by default, but we accept invalid certs
/// in case HTTPS is enabled with a self-signed cert.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(4)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .expect("failed to build shared reqwest client for Xiaomi")
}

/// A cache entry: the JSON value and the instant it was stored.
struct CacheEntry {
    value: Value,
    inserted: Instant,
}

/// Thread-safe TTL cache for Xiaomi API responses.
pub struct XiaomiCache {
    map: DashMap<String, CacheEntry>,
    ttl: Duration,
}

impl XiaomiCache {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
            ttl: CACHE_TTL,
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        let entry = self.map.get(key)?;
        if entry.inserted.elapsed() < self.ttl {
            Some(entry.value.clone())
        } else {
            drop(entry);
            self.map.remove(key);
            None
        }
    }

    pub fn set(&self, key: String, value: Value) {
        self.map.insert(
            key,
            CacheEntry {
                value,
                inserted: Instant::now(),
            },
        );
    }

    pub fn clear(&self) {
        self.map.clear();
    }
}

impl Default for XiaomiCache {
    fn default() -> Self {
        Self::new()
    }
}

/// A lightweight client for the Xiaomi MiWiFi HTTP API.
#[derive(Debug, Clone)]
pub struct XiaomiClient {
    base_url: String,
    password: String,
    http: reqwest::Client,
}

impl XiaomiClient {
    /// Create a Xiaomi client reusing an existing `reqwest::Client`.
    pub fn with_http(base_url: &str, password: &str, http: reqwest::Client) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            password: password.to_string(),
            http,
        }
    }

    /// Login to obtain a `stok` token.
    async fn login(&self) -> Result<String> {
        let url = format!("{}/cgi-bin/luci/api/xqsystem/login", self.base_url);

        let resp = self
            .http
            .post(&url)
            .form(&[("username", "admin"), ("password", self.password.as_str())])
            .send()
            .await
            .context("Xiaomi login request failed")?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context("failed to read Xiaomi login response body")?;

        if !status.is_success() {
            anyhow::bail!("Xiaomi login returned HTTP {status}: {body}");
        }

        let login: LoginResponse =
            serde_json::from_str(&body).context("failed to parse Xiaomi login response")?;

        if login.code != 0 {
            anyhow::bail!("Xiaomi login failed with code {}", login.code);
        }

        login
            .token
            .ok_or_else(|| anyhow::anyhow!("Xiaomi login returned no token"))
    }

    /// GET an authenticated MiWiFi API endpoint.
    async fn get(&self, stok: &str, api_path: &str) -> Result<Value> {
        let url = format!("{}/cgi-bin/luci/;stok={}/{}", self.base_url, stok, api_path);

        let start = Instant::now();
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .context("Xiaomi API request failed")?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context("failed to read Xiaomi API response body")?;

        let elapsed = start.elapsed();
        tracing::debug!(
            api_path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "Xiaomi API response"
        );

        if !status.is_success() {
            anyhow::bail!("Xiaomi API returned HTTP {status}: {body}");
        }

        let parsed: Value =
            serde_json::from_str(&body).context("failed to parse Xiaomi API response JSON")?;

        // MiWiFi APIs return {"code": 0, ...} on success
        if parsed.get("code").and_then(|c| c.as_i64()) != Some(0) {
            anyhow::bail!(
                "Xiaomi API error: code={}",
                parsed.get("code").unwrap_or(&Value::Null)
            );
        }

        Ok(parsed)
    }

    /// Login and fetch an API endpoint, returning the raw JSON.
    async fn authenticated_get(&self, api_path: &str) -> Result<Value> {
        let stok = self.login().await?;
        self.get(&stok, api_path).await
    }

    /// Fetch system status (`api/misystem/status`).
    pub async fn system_status(&self) -> Result<SystemStatusData> {
        let val = self.authenticated_get("api/misystem/status").await?;
        let data: SystemStatusData =
            serde_json::from_value(val).context("failed to parse system status")?;
        Ok(data)
    }

    /// Fetch WAN info (`api/xqnetwork/wan_info`).
    pub async fn wan_info(&self) -> Result<WanInfoData> {
        let val = self.authenticated_get("api/xqnetwork/wan_info").await?;
        let data: WanInfoData = serde_json::from_value(val).context("failed to parse WAN info")?;
        Ok(data)
    }

    /// Fetch init info (`api/xqsystem/init_info`).
    pub async fn init_info(&self) -> Result<InitInfoData> {
        let val = self.authenticated_get("api/xqsystem/init_info").await?;
        let data: InitInfoData =
            serde_json::from_value(val).context("failed to parse init info")?;
        Ok(data)
    }

    /// Check ROM update (`api/xqsystem/check_rom_update`).
    pub async fn check_rom_update(&self) -> Result<RomUpdateData> {
        let val = self
            .authenticated_get("api/xqsystem/check_rom_update")
            .await?;
        let data: RomUpdateData =
            serde_json::from_value(val).context("failed to parse ROM update check")?;
        Ok(data)
    }

    /// Fetch WiFi new status (`api/misystem/newstatus`).
    pub async fn new_status(&self) -> Result<NewStatusData> {
        let val = self.authenticated_get("api/misystem/newstatus").await?;
        let data: NewStatusData =
            serde_json::from_value(val).context("failed to parse new status")?;
        Ok(data)
    }

    /// Fetch WiFi detail for all bands (`api/xqnetwork/wifi_detail_all`).
    pub async fn wifi_detail_all(&self) -> Result<WifiDetailAllData> {
        let val = self
            .authenticated_get("api/xqnetwork/wifi_detail_all")
            .await?;
        let data: WifiDetailAllData =
            serde_json::from_value(val).context("failed to parse WiFi detail")?;
        Ok(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_get_returns_none_when_empty() {
        let cache = XiaomiCache::new();
        assert!(cache.get("status").is_none());
    }

    #[test]
    fn cache_set_then_get_returns_value() {
        let cache = XiaomiCache::new();
        let val = serde_json::json!({"cpu": {"load": 10}});
        cache.set("status".into(), val.clone());
        assert_eq!(cache.get("status"), Some(val));
    }

    #[test]
    fn cache_clear_removes_everything() {
        let cache = XiaomiCache::new();
        cache.set("a".into(), Value::Null);
        cache.set("b".into(), Value::Null);
        cache.clear();
        assert!(cache.get("a").is_none());
        assert!(cache.get("b").is_none());
    }
}
