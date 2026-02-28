//! MikroTik RouterOS REST API client.
//!
//! Communicates with a MikroTik router using its native REST API (RouterOS v7+).
//! Auth is via HTTP Basic auth. All responses are JSON.

use anyhow::{Context, Result};
use dashmap::DashMap;
use reqwest::Method;
use serde::Serialize;
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

    /// Send a mutating request with a JSON body.
    async fn send_json<B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        body: &B,
    ) -> Result<()> {
        let url = format!("{}/rest{}", self.base_url, path);

        let start = Instant::now();
        let resp = self
            .http
            .request(method.clone(), &url)
            .basic_auth(&self.username, Some(&self.password))
            .json(body)
            .send()
            .await
            .context("MikroTik API request failed")?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .context("failed to read MikroTik API response body")?;
        let elapsed = start.elapsed();

        tracing::info!(
            method = %method,
            path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "MikroTik API response"
        );

        if !status.is_success() {
            anyhow::bail!("MikroTik API returned HTTP {status}: {text}");
        }

        Ok(())
    }

    /// Send a mutating request without a JSON body.
    async fn send_no_body(&self, method: Method, path: &str) -> Result<()> {
        let url = format!("{}/rest{}", self.base_url, path);

        let start = Instant::now();
        let resp = self
            .http
            .request(method.clone(), &url)
            .basic_auth(&self.username, Some(&self.password))
            .send()
            .await
            .context("MikroTik API request failed")?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .context("failed to read MikroTik API response body")?;
        let elapsed = start.elapsed();

        tracing::info!(
            method = %method,
            path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "MikroTik API response"
        );

        if !status.is_success() {
            anyhow::bail!("MikroTik API returned HTTP {status}: {text}");
        }

        Ok(())
    }

    /// POST a MikroTik REST command with a JSON body, returning parsed JSON.
    async fn post(&self, path: &str, body: &Value) -> Result<Value> {
        let url = format!("{}/rest{}", self.base_url, path);

        let start = Instant::now();
        let resp = self
            .http
            .post(&url)
            .basic_auth(&self.username, Some(&self.password))
            .json(body)
            .send()
            .await
            .context("MikroTik API POST request failed")?;

        let status = resp.status();
        let resp_body = resp
            .text()
            .await
            .context("failed to read MikroTik API POST response body")?;

        let elapsed = start.elapsed();
        tracing::debug!(
            path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "MikroTik API POST response"
        );

        if !status.is_success() {
            anyhow::bail!("MikroTik API POST returned HTTP {status}: {resp_body}");
        }

        let parsed: Value = serde_json::from_str(&resp_body)
            .context("failed to parse MikroTik API POST response JSON")?;

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

    /// Fetch all VLAN interfaces.
    pub async fn vlans(&self) -> Result<Vec<VlanInterface>> {
        let val = self.get("/interface/vlan").await?;
        let res: Vec<VlanInterface> =
            serde_json::from_value(val).context("failed to parse VLAN interfaces")?;
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
        let res: Vec<IpRoute> = serde_json::from_value(val).context("failed to parse IP routes")?;
        Ok(res)
    }

    /// Fetch DHCP server leases.
    pub async fn dhcp_leases(&self) -> Result<Vec<DhcpLease>> {
        let val = self.get("/ip/dhcp-server/lease").await?;
        let res: Vec<DhcpLease> =
            serde_json::from_value(val).context("failed to parse DHCP leases")?;
        Ok(res)
    }

    /// Create a static DHCP lease (reservation).
    pub async fn create_dhcp_static_lease(&self, req: &DhcpStaticLeaseWriteRequest) -> Result<()> {
        self.send_json(Method::POST, "/ip/dhcp-server/lease", req)
            .await
    }

    /// Delete a DHCP lease by RouterOS `.id`.
    pub async fn delete_dhcp_lease(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/ip/dhcp-server/lease/{id}"))
            .await
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

    /// Fetch bridge host table (MAC forwarding database).
    pub async fn bridge_hosts(&self) -> Result<Vec<BridgeHost>> {
        let val = self.get("/interface/bridge/host").await?;
        let res: Vec<BridgeHost> =
            serde_json::from_value(val).context("failed to parse bridge hosts")?;
        Ok(res)
    }

    /// Fetch WireGuard interfaces.
    pub async fn wireguard_interfaces(&self) -> Result<Vec<WgInterface>> {
        let val = self.get("/interface/wireguard").await?;
        let res: Vec<WgInterface> =
            serde_json::from_value(val).context("failed to parse WireGuard interfaces")?;
        Ok(res)
    }

    /// Monitor traffic on a specific interface (returns instantaneous bps).
    ///
    /// Uses `POST /rest/interface/monitor-traffic` with `once` to get a single
    /// snapshot of rx/tx bits-per-second.
    pub async fn monitor_traffic(&self, interface: &str) -> Result<Vec<MonitorTrafficResult>> {
        let body = serde_json::json!({
            "interface": interface,
            "once": ""
        });
        let val = self.post("/interface/monitor-traffic", &body).await?;
        let res: Vec<MonitorTrafficResult> =
            serde_json::from_value(val).context("failed to parse monitor-traffic result")?;
        Ok(res)
    }

    /// Fetch WireGuard peers.
    pub async fn wireguard_peers(&self) -> Result<Vec<WgPeer>> {
        let val = self.get("/interface/wireguard/peers").await?;
        let res: Vec<WgPeer> =
            serde_json::from_value(val).context("failed to parse WireGuard peers")?;
        Ok(res)
    }

    /// Create a VLAN interface.
    pub async fn create_vlan(&self, req: &VlanWriteRequest) -> Result<()> {
        self.send_json(Method::POST, "/interface/vlan", req).await
    }

    /// Update a VLAN interface by RouterOS `.id`.
    pub async fn update_vlan(&self, id: &str, req: &VlanWriteRequest) -> Result<()> {
        self.send_json(Method::PATCH, &format!("/interface/vlan/{id}"), req)
            .await
    }

    /// Delete a VLAN interface by RouterOS `.id`.
    pub async fn delete_vlan(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/interface/vlan/{id}"))
            .await
    }

    /// Fetch all simple queues.
    pub async fn simple_queues(&self) -> Result<Vec<SimpleQueue>> {
        let val = self.get("/queue/simple").await?;
        let res: Vec<SimpleQueue> =
            serde_json::from_value(val).context("failed to parse simple queues")?;
        Ok(res)
    }

    /// Create a simple queue.
    pub async fn create_simple_queue(&self, req: &SimpleQueueWriteRequest) -> Result<()> {
        self.send_json(Method::POST, "/queue/simple", req).await
    }

    /// Update a simple queue by RouterOS `.id`.
    pub async fn update_simple_queue(&self, id: &str, req: &SimpleQueueWriteRequest) -> Result<()> {
        self.send_json(Method::PATCH, &format!("/queue/simple/{id}"), req)
            .await
    }

    /// Delete a simple queue by RouterOS `.id`.
    pub async fn delete_simple_queue(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/queue/simple/{id}"))
            .await
    }

    /// Fetch firewall address list entries.
    pub async fn firewall_address_list(&self) -> Result<Vec<FirewallAddressList>> {
        let val = self.get("/ip/firewall/address-list").await?;
        let res: Vec<FirewallAddressList> =
            serde_json::from_value(val).context("failed to parse firewall address list")?;
        Ok(res)
    }

    /// Create a firewall filter rule.
    pub async fn create_firewall_filter(&self, req: &FirewallFilterWriteRequest) -> Result<()> {
        self.send_json(Method::POST, "/ip/firewall/filter", req)
            .await
    }

    /// Update a firewall filter rule by RouterOS `.id`.
    pub async fn update_firewall_filter(
        &self,
        id: &str,
        req: &FirewallFilterWriteRequest,
    ) -> Result<()> {
        self.send_json(Method::PATCH, &format!("/ip/firewall/filter/{id}"), req)
            .await
    }

    /// Delete a firewall filter rule by RouterOS `.id`.
    pub async fn delete_firewall_filter(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/ip/firewall/filter/{id}"))
            .await
    }

    /// Toggle a firewall filter rule's disabled state.
    pub async fn toggle_firewall_filter(&self, id: &str, disabled: bool) -> Result<()> {
        let body = serde_json::json!({
            "disabled": if disabled { "true" } else { "false" }
        });
        self.send_json(Method::PATCH, &format!("/ip/firewall/filter/{id}"), &body)
            .await
    }

    /// Create a firewall NAT rule.
    pub async fn create_firewall_nat(&self, req: &FirewallNatWriteRequest) -> Result<()> {
        self.send_json(Method::POST, "/ip/firewall/nat", req).await
    }

    /// Update a firewall NAT rule by RouterOS `.id`.
    pub async fn update_firewall_nat(&self, id: &str, req: &FirewallNatWriteRequest) -> Result<()> {
        self.send_json(Method::PATCH, &format!("/ip/firewall/nat/{id}"), req)
            .await
    }

    /// Delete a firewall NAT rule by RouterOS `.id`.
    pub async fn delete_firewall_nat(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/ip/firewall/nat/{id}"))
            .await
    }

    /// Toggle a firewall NAT rule's disabled state.
    pub async fn toggle_firewall_nat(&self, id: &str, disabled: bool) -> Result<()> {
        let body = serde_json::json!({
            "disabled": if disabled { "true" } else { "false" }
        });
        self.send_json(Method::PATCH, &format!("/ip/firewall/nat/{id}"), &body)
            .await
    }

    /// Create a firewall address list entry.
    pub async fn create_firewall_address_list(
        &self,
        req: &FirewallAddressListWriteRequest,
    ) -> Result<()> {
        self.send_json(Method::POST, "/ip/firewall/address-list", req)
            .await
    }

    /// Delete a firewall address list entry by RouterOS `.id`.
    pub async fn delete_firewall_address_list(&self, id: &str) -> Result<()> {
        self.send_no_body(Method::DELETE, &format!("/ip/firewall/address-list/{id}"))
            .await
    }

    /// Fetch all queue tree entries.
    pub async fn queue_tree(&self) -> Result<Vec<QueueTree>> {
        let val = self.get("/queue/tree").await?;
        let res: Vec<QueueTree> =
            serde_json::from_value(val).context("failed to parse queue tree")?;
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
