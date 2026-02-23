//! MikroTik RouterOS REST API client.
//!
//! Communicates with a MikroTik router using its native REST API (RouterOS v7+).
//! Auth is via HTTP Basic auth. All responses are JSON.

use anyhow::{Context, Result};
use dashmap::DashMap;
use serde_json::Value;
use std::time::{Duration, Instant};

use super::types::*;

/// Default TTL for cached responses (30 seconds, matching VyOS cache).
const CACHE_TTL: Duration = Duration::from_secs(30);

/// Build the shared `reqwest::Client` for MikroTik API calls.
///
/// MikroTik routers may use self-signed certs, so we accept invalid certs.
/// Connection pooling with keep-alive reuses TCP connections across requests.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(4)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .expect("failed to build shared reqwest client for MikroTik")
}

/// A cache entry: the JSON value and the instant it was stored.
struct CacheEntry {
    value: Value,
    inserted: Instant,
}

/// Thread-safe TTL cache for MikroTik API responses.
pub struct MikrotikCache {
    map: DashMap<String, CacheEntry>,
    ttl: Duration,
}

impl MikrotikCache {
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

impl Default for MikrotikCache {
    fn default() -> Self {
        Self::new()
    }
}

/// A lightweight client for the MikroTik RouterOS REST API.
#[derive(Debug, Clone)]
pub struct MikrotikClient {
    base_url: String,
    username: String,
    password: String,
    http: reqwest::Client,
}

impl MikrotikClient {
    /// Create a MikroTik client reusing an existing `reqwest::Client`.
    pub fn with_http(
        base_url: &str,
        username: &str,
        password: &str,
        http: reqwest::Client,
    ) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            username: username.to_string(),
            password: password.to_string(),
            http,
        }
    }

    /// GET a MikroTik REST endpoint and parse the JSON response.
    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}/rest{}", self.base_url, path);

        let start = Instant::now();
        let resp = self
            .http
            .get(&url)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("MikroTik API request failed")?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context("failed to read MikroTik API response body")?;

        let elapsed = start.elapsed();
        tracing::info!(
            path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "MikroTik API response"
        );

        if !status.is_success() {
            anyhow::bail!("MikroTik API returned HTTP {status}: {body}");
        }

        let parsed: Value =
            serde_json::from_str(&body).context("failed to parse MikroTik API response JSON")?;

        Ok(parsed)
    }

    /// Fetch system resource info (CPU, RAM, uptime, version).
    pub async fn system_resource(&self) -> Result<SystemResource> {
        let val = self.get("/system/resource").await?;
        let res: SystemResource =
            serde_json::from_value(val).context("failed to parse system resource")?;
        Ok(res)
    }

    /// Fetch all interfaces.
    pub async fn interfaces(&self) -> Result<Vec<MtInterface>> {
        let val = self.get("/interface").await?;
        let res: Vec<MtInterface> =
            serde_json::from_value(val).context("failed to parse interfaces")?;
        Ok(res)
    }

    /// Fetch IP addresses assigned to interfaces.
    pub async fn ip_addresses(&self) -> Result<Vec<IpAddress>> {
        let val = self.get("/ip/address").await?;
        let res: Vec<IpAddress> =
            serde_json::from_value(val).context("failed to parse IP addresses")?;
        Ok(res)
    }

    /// Fetch the IP routing table.
    pub async fn ip_routes(&self) -> Result<Vec<IpRoute>> {
        let val = self.get("/ip/route").await?;
        let res: Vec<IpRoute> =
            serde_json::from_value(val).context("failed to parse IP routes")?;
        Ok(res)
    }

    /// Fetch DHCP server leases.
    pub async fn dhcp_leases(&self) -> Result<Vec<DhcpLease>> {
        let val = self.get("/ip/dhcp-server/lease").await?;
        let res: Vec<DhcpLease> =
            serde_json::from_value(val).context("failed to parse DHCP leases")?;
        Ok(res)
    }

    /// Fetch firewall filter rules.
    pub async fn firewall_filter(&self) -> Result<Vec<FirewallFilter>> {
        let val = self.get("/ip/firewall/filter").await?;
        let res: Vec<FirewallFilter> =
            serde_json::from_value(val).context("failed to parse firewall filter rules")?;
        Ok(res)
    }

    /// Fetch firewall NAT rules.
    pub async fn firewall_nat(&self) -> Result<Vec<FirewallNat>> {
        let val = self.get("/ip/firewall/nat").await?;
        let res: Vec<FirewallNat> =
            serde_json::from_value(val).context("failed to parse firewall NAT rules")?;
        Ok(res)
    }

    /// Fetch DNS settings.
    pub async fn dns(&self) -> Result<DnsSettings> {
        let val = self.get("/ip/dns").await?;
        let res: DnsSettings = serde_json::from_value(val).context("failed to parse DNS")?;
        Ok(res)
    }

    /// Fetch WireGuard interfaces.
    pub async fn wireguard_interfaces(&self) -> Result<Vec<WgInterface>> {
        let val = self.get("/interface/wireguard").await?;
        let res: Vec<WgInterface> =
            serde_json::from_value(val).context("failed to parse WireGuard interfaces")?;
        Ok(res)
    }

    /// Fetch WireGuard peers.
    pub async fn wireguard_peers(&self) -> Result<Vec<WgPeer>> {
        let val = self.get("/interface/wireguard/peers").await?;
        let res: Vec<WgPeer> =
            serde_json::from_value(val).context("failed to parse WireGuard peers")?;
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_get_returns_none_when_empty() {
        let cache = MikrotikCache::new();
        assert!(cache.get("interfaces").is_none());
    }

    #[test]
    fn cache_set_then_get_returns_value() {
        let cache = MikrotikCache::new();
        let val = serde_json::json!([{"name": "ether1"}]);
        cache.set("interfaces".into(), val.clone());
        assert_eq!(cache.get("interfaces"), Some(val));
    }

    #[test]
    fn cache_clear_removes_everything() {
        let cache = MikrotikCache::new();
        cache.set("a".into(), Value::Null);
        cache.set("b".into(), Value::Null);
        cache.clear();
        assert!(cache.get("a").is_none());
        assert!(cache.get("b").is_none());
    }
}
