//! Xiaomi MiWiFi HTTP API client.
//!
//! Implements the SHA256 auth protocol (newEncryptMode=1) used by modern
//! Xiaomi routers (e.g. BE3600 2.5G mesh).
//!
//! Auth flow:
//! 1. GET /cgi-bin/luci/web/home → extract `key` and `deviceId` from HTML
//! 2. Build nonce: `{type}_{deviceId}_{timestamp}_{random}`
//! 3. Hash password: SHA256(nonce + SHA256(password + key))
//! 4. POST /cgi-bin/luci/api/xqsystem/login → returns stok token
//!
//! All authenticated endpoints use URL-path token:
//!   http://<ip>/cgi-bin/luci/;stok=<TOKEN>/api/<endpoint>

use anyhow::{Context, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use super::types::*;

/// Build the shared `reqwest::Client` for Xiaomi MiWiFi API calls.
///
/// Xiaomi routers use plain HTTP by default on the LAN.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(4)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .expect("failed to build shared reqwest client for Xiaomi MiWiFi")
}

/// In-memory stok token with expiry tracking.
#[derive(Debug, Clone)]
struct StokToken {
    token: String,
    obtained_at: Instant,
}

impl StokToken {
    /// Tokens are considered fresh for 30 minutes.
    fn is_valid(&self) -> bool {
        self.obtained_at.elapsed() < Duration::from_secs(30 * 60)
    }
}

/// Thread-safe Xiaomi MiWiFi API client with automatic token management.
#[derive(Clone)]
pub struct XiaomiClient {
    base_url: String,
    password: String,
    http: reqwest::Client,
    stok: Arc<RwLock<Option<StokToken>>>,
}

impl XiaomiClient {
    /// Create a new Xiaomi client reusing an existing `reqwest::Client`.
    ///
    /// When `proxy_host` is `Some`, all HTTP requests are sent to
    /// `http://<proxy_host>` instead of `http://<router_ip>`.
    /// This is used when the router filters port 80 from non-DHCP clients
    /// and a TCP proxy (e.g. socat) on a reachable host forwards traffic
    /// to the router.
    pub fn new(
        router_ip: &str,
        password: &str,
        http: reqwest::Client,
        proxy_host: Option<&str>,
    ) -> Self {
        let target = proxy_host.unwrap_or(router_ip);
        let base_url = format!("http://{}", target.trim_end_matches('/'));
        Self {
            base_url,
            password: password.to_string(),
            http,
            stok: Arc::new(RwLock::new(None)),
        }
    }

    // ── Auth helpers ────────────────────────────────────────

    /// Extract `key` and `deviceId` from the router's home page.
    async fn extract_credentials(&self) -> Result<(String, String)> {
        let url = format!("{}/cgi-bin/luci/web/home", self.base_url);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .context("failed to fetch MiWiFi home page")?;

        let body = resp
            .text()
            .await
            .context("failed to read MiWiFi home page body")?;

        // Extract key: look for `key = "..."` or `var key = "..."` in the HTML/JS
        let key = extract_js_var(&body, "key")
            .context("failed to extract 'key' from MiWiFi home page")?;
        let device_id = extract_js_var(&body, "deviceId")
            .context("failed to extract 'deviceId' from MiWiFi home page")?;

        Ok((key, device_id))
    }

    /// Generate a nonce string for the login request.
    fn generate_nonce(device_id: &str) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let random: u32 = (timestamp as u32) ^ 0x1234_5678; // simple deterministic random
        format!("0_{device_id}_{timestamp}_{random}")
    }

    /// Compute the password hash: SHA256(nonce + SHA256(password + key))
    fn hash_password(password: &str, key: &str, nonce: &str) -> String {
        // Step 1: SHA256(password + key)
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        hasher.update(key.as_bytes());
        let inner_hash = format!("{:x}", hasher.finalize());

        // Step 2: SHA256(nonce + inner_hash)
        let mut hasher = Sha256::new();
        hasher.update(nonce.as_bytes());
        hasher.update(inner_hash.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// POST login form and extract the stok token from the response.
    /// Returns `Ok(token)` on success or an error describing the failure.
    async fn post_login(&self, form: &[(&str, &str)]) -> Result<String> {
        let login_url = format!("{}/cgi-bin/luci/api/xqsystem/login", self.base_url);

        let resp = self
            .http
            .post(&login_url)
            .form(form)
            .send()
            .await
            .context("MiWiFi login request failed")?;

        let status = resp.status();
        let body: Value = resp
            .json()
            .await
            .context("failed to parse MiWiFi login response")?;

        let code = body.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);

        tracing::debug!(
            http_status = %status,
            code,
            "MiWiFi login response"
        );

        if code != 0 {
            let msg = body
                .get("msg")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            anyhow::bail!("MiWiFi login failed (code {code}): {msg}");
        }

        let token = body
            .get("token")
            .and_then(|v| v.as_str())
            .context("MiWiFi login response missing 'token' field")?
            .to_string();

        Ok(token)
    }

    /// Login using SHA256 nonce-based auth (newEncryptMode=1).
    async fn login_sha256(&self) -> Result<String> {
        let (key, device_id) = self.extract_credentials().await?;
        let nonce = Self::generate_nonce(&device_id);
        let password_hash = Self::hash_password(&self.password, &key, &nonce);

        self.post_login(&[
            ("username", "admin"),
            ("password", password_hash.as_str()),
            ("logtype", "2"),
            ("nonce", nonce.as_str()),
        ])
        .await
    }

    /// Login using plain password (no nonce, no hashing).
    async fn login_plain(&self) -> Result<String> {
        self.post_login(&[("username", "admin"), ("password", self.password.as_str())])
            .await
    }

    /// Perform the login flow and obtain a stok token.
    ///
    /// Tries SHA256 nonce-based auth first. If the router does not support it
    /// (returns code 401 — common on BE3600 and similar models), falls back
    /// to plain password auth.
    async fn login(&self) -> Result<String> {
        match self.login_sha256().await {
            Ok(token) => {
                tracing::debug!("MiWiFi SHA256 login succeeded");
                Ok(token)
            }
            Err(sha256_err) => {
                tracing::info!(
                    error = %sha256_err,
                    "MiWiFi SHA256 login failed, falling back to plain password"
                );
                match self.login_plain().await {
                    Ok(token) => {
                        tracing::debug!("MiWiFi plain password login succeeded");
                        Ok(token)
                    }
                    Err(plain_err) => {
                        // Both methods failed — report both errors for debugging.
                        anyhow::bail!(
                            "MiWiFi login failed with both methods. \
                             SHA256: {sha256_err}; plain: {plain_err}"
                        )
                    }
                }
            }
        }
    }

    /// Get a valid stok token, logging in if necessary.
    async fn get_stok(&self) -> Result<String> {
        // Try the cached token first.
        {
            let cached = self.stok.read().await;
            if let Some(ref tok) = *cached {
                if tok.is_valid() {
                    return Ok(tok.token.clone());
                }
            }
        }

        // Need to refresh.
        let token = self.login().await?;
        let mut cached = self.stok.write().await;
        *cached = Some(StokToken {
            token: token.clone(),
            obtained_at: Instant::now(),
        });
        Ok(token)
    }

    /// Invalidate the cached token (e.g., after a 401 or error response).
    async fn invalidate_stok(&self) {
        let mut cached = self.stok.write().await;
        *cached = None;
    }

    // ── HTTP helpers ────────────────────────────────────────

    /// GET an unauthenticated endpoint.
    async fn get_no_auth(&self, api_path: &str) -> Result<Value> {
        let url = format!("{}/cgi-bin/luci/api/{}", self.base_url, api_path);

        let start = Instant::now();
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .context("MiWiFi API request failed")?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context("failed to read MiWiFi API response body")?;
        let elapsed = start.elapsed();

        tracing::info!(
            path = api_path,
            http_status = %status,
            elapsed_ms = elapsed.as_millis() as u64,
            "MiWiFi API response (no auth)"
        );

        if !status.is_success() {
            anyhow::bail!("MiWiFi API returned HTTP {status}: {body}");
        }

        let parsed: Value =
            serde_json::from_str(&body).context("failed to parse MiWiFi API response JSON")?;

        Ok(parsed)
    }

    /// GET an authenticated endpoint (uses stok token in URL path).
    /// Retries once on auth failure by refreshing the token.
    async fn get_authed(&self, api_path: &str) -> Result<Value> {
        for attempt in 0..2 {
            let stok = self.get_stok().await?;
            let url = format!(
                "{}/cgi-bin/luci/;stok={}/api/{}",
                self.base_url, stok, api_path
            );

            let start = Instant::now();
            let resp = self
                .http
                .get(&url)
                .send()
                .await
                .context("MiWiFi API request failed")?;

            let status = resp.status();
            let body = resp
                .text()
                .await
                .context("failed to read MiWiFi API response body")?;
            let elapsed = start.elapsed();

            tracing::info!(
                path = api_path,
                http_status = %status,
                elapsed_ms = elapsed.as_millis() as u64,
                attempt,
                "MiWiFi API response (authed)"
            );

            if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                if attempt == 0 {
                    tracing::warn!("MiWiFi auth failed, refreshing token");
                    self.invalidate_stok().await;
                    continue;
                }
                anyhow::bail!("MiWiFi API returned HTTP {status} after token refresh");
            }

            if !status.is_success() {
                anyhow::bail!("MiWiFi API returned HTTP {status}: {body}");
            }

            let parsed: Value =
                serde_json::from_str(&body).context("failed to parse MiWiFi API response JSON")?;

            // Check for error code in response body.
            let code = parsed.get("code").and_then(|v| v.as_i64()).unwrap_or(0);
            if code != 0 && attempt == 0 {
                tracing::warn!(code, "MiWiFi API error code, refreshing token");
                self.invalidate_stok().await;
                continue;
            }

            return Ok(parsed);
        }

        anyhow::bail!("MiWiFi API request failed after retries")
    }

    // ── Public API methods ──────────────────────────────────

    /// Fetch mesh topology graph (no auth required).
    pub async fn topo_graph(&self) -> Result<TopoGraph> {
        let val = self.get_no_auth("misystem/topo_graph").await?;
        let res: MiWiFiResponse<TopoGraph> =
            serde_json::from_value(val).context("failed to parse topo_graph")?;
        Ok(res.data)
    }

    /// Fetch system status (CPU, memory, temp, WAN speeds, device counts).
    pub async fn system_status(&self) -> Result<SystemStatus> {
        let val = self.get_authed("misystem/status").await?;
        let res: SystemStatus =
            serde_json::from_value(val).context("failed to parse system status")?;
        Ok(res)
    }

    /// Fetch all connected devices.
    pub async fn device_list(&self) -> Result<Vec<MiWiFiDevice>> {
        let val = self.get_authed("misystem/devicelist").await?;
        let res: DeviceListResponse =
            serde_json::from_value(val).context("failed to parse device list")?;
        Ok(res.list)
    }

    /// Fetch new status (hardware info, connected count, WiFi SSIDs).
    pub async fn new_status(&self) -> Result<NewStatus> {
        let val = self.get_authed("misystem/newstatus").await?;
        let res: NewStatus = serde_json::from_value(val).context("failed to parse new status")?;
        Ok(res)
    }

    /// Fetch WiFi connected devices with signal strength and band.
    pub async fn wifi_devices(&self) -> Result<Vec<WifiDevice>> {
        let val = self.get_authed("xqnetwork/wifi_connect_devices").await?;
        let res: WifiDevicesResponse =
            serde_json::from_value(val).context("failed to parse wifi devices")?;
        Ok(res.list)
    }

    /// Fetch WAN info (type, gateway, DNS, IPv6).
    pub async fn wan_info(&self) -> Result<WanInfo> {
        let val = self.get_authed("xqnetwork/wan_info").await?;
        let res: WanInfoResponse =
            serde_json::from_value(val).context("failed to parse WAN info")?;
        res.info.context("WAN info field missing from response")
    }

    /// Fetch LAN info (IP, subnet, link status per port).
    pub async fn lan_info(&self) -> Result<LanInfo> {
        let val = self.get_authed("xqnetwork/lan_info").await?;
        let res: LanInfoResponse =
            serde_json::from_value(val).context("failed to parse LAN info")?;
        res.info.context("LAN info field missing from response")
    }

    /// Fetch per-band WiFi details (SSID, channel, bandwidth, band steering).
    pub async fn wifi_detail_all(&self) -> Result<Vec<WifiBandDetail>> {
        let val = self.get_authed("xqnetwork/wifi_detail_all").await?;
        let res: WifiDetailAllResponse =
            serde_json::from_value(val).context("failed to parse wifi detail all")?;
        Ok(res.info)
    }

    /// Fetch init info (firmware version, hardware model, router name).
    pub async fn init_info(&self) -> Result<InitInfo> {
        let val = self.get_authed("xqsystem/init_info").await?;
        let res: InitInfo = serde_json::from_value(val).context("failed to parse init info")?;
        Ok(res)
    }

    /// Fetch init info without authentication (for reachability probes).
    ///
    /// The `xqsystem/init_info` endpoint on Xiaomi routers does not require
    /// a stok token, so this can succeed even when login/auth is broken.
    pub async fn init_info_no_auth(&self) -> Result<InitInfo> {
        let val = self.get_no_auth("xqsystem/init_info").await?;
        let res: InitInfo = serde_json::from_value(val).context("failed to parse init info")?;
        Ok(res)
    }

    /// Check for ROM/firmware updates.
    pub async fn check_rom_update(&self) -> Result<Option<RomUpdateInfo>> {
        let val = self.get_authed("xqsystem/check_rom_update").await?;
        // The update info may be absent if no update is available.
        let update: Option<RomUpdateInfo> = serde_json::from_value(val).ok();
        Ok(update)
    }

    /// Fetch system uptime.
    pub async fn uptime(&self) -> Result<Option<String>> {
        let val = self.get_authed("misystem/status").await?;
        let res: UptimeResponse = serde_json::from_value(val).context("failed to parse uptime")?;
        Ok(res.uptime)
    }
}

/// Extract a JavaScript variable value from HTML source.
/// Matches patterns like `var key = "abc123"`, `key = "abc123"`, `key: "abc123"`.
fn extract_js_var(html: &str, var_name: &str) -> Option<String> {
    // Build patterns to try, including variants with spaces
    let patterns = [
        format!("{var_name} = \""),
        format!("{var_name} = '"),
        format!("{var_name}= \""),
        format!("{var_name}= '"),
        format!("{var_name}=\""),
        format!("{var_name}='"),
        format!("{var_name}: \""),
        format!("{var_name}: '"),
        format!("{var_name}:\""),
        format!("{var_name}:'"),
    ];

    for pattern in &patterns {
        if let Some(start) = html.find(pattern.as_str()) {
            let value_start = start + pattern.len();
            let quote_char = if pattern.ends_with('"') { '"' } else { '\'' };
            if let Some(end) = html[value_start..].find(quote_char) {
                let value = &html[value_start..value_start + end];
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── extract_js_var tests ───────────────────────────────────

    #[test]
    fn extract_key_from_html() {
        let html = r#"var key = "a2ffa5c9be07488bbb04a3a47d3c5f6a";"#;
        assert_eq!(
            extract_js_var(html, "key"),
            Some("a2ffa5c9be07488bbb04a3a47d3c5f6a".to_string())
        );
    }

    #[test]
    fn extract_device_id_from_html() {
        let html = r#"var deviceId = "AA:BB:CC:DD:EE:FF";"#;
        assert_eq!(
            extract_js_var(html, "deviceId"),
            Some("AA:BB:CC:DD:EE:FF".to_string())
        );
    }

    #[test]
    fn extract_js_var_single_quotes() {
        let html = "var key = 'abc123';";
        assert_eq!(extract_js_var(html, "key"), Some("abc123".to_string()));
    }

    #[test]
    fn extract_js_var_no_var_prefix() {
        let html = r#"key = "deadbeef";"#;
        assert_eq!(extract_js_var(html, "key"), Some("deadbeef".to_string()));
    }

    #[test]
    fn extract_js_var_no_space_around_equals() {
        let html = r#"key="no_spaces";"#;
        assert_eq!(extract_js_var(html, "key"), Some("no_spaces".to_string()));
    }

    #[test]
    fn extract_js_var_colon_syntax() {
        let html = r#"key: "json_style""#;
        assert_eq!(extract_js_var(html, "key"), Some("json_style".to_string()));
    }

    #[test]
    fn extract_js_var_colon_no_space() {
        let html = r#"key:"compact_json""#;
        assert_eq!(
            extract_js_var(html, "key"),
            Some("compact_json".to_string())
        );
    }

    #[test]
    fn extract_js_var_returns_none_for_missing() {
        let html = r#"var other = "value";"#;
        assert_eq!(extract_js_var(html, "key"), None);
    }

    #[test]
    fn extract_js_var_returns_none_for_empty_value() {
        let html = r#"var key = "";"#;
        assert_eq!(extract_js_var(html, "key"), None);
    }

    #[test]
    fn extract_js_var_in_realistic_html_page() {
        let html = r#"
<!DOCTYPE html>
<html>
<head><title>MiWiFi</title></head>
<body>
<script>
    var key = "a2ffa5c9be07488bbb04a3a47d3c5f6a";
    var deviceId = "28:D1:27:AB:CD:EF";
    var newEncryptMode = 1;
</script>
</body>
</html>"#;
        assert_eq!(
            extract_js_var(html, "key"),
            Some("a2ffa5c9be07488bbb04a3a47d3c5f6a".to_string())
        );
        assert_eq!(
            extract_js_var(html, "deviceId"),
            Some("28:D1:27:AB:CD:EF".to_string())
        );
    }

    // ── Nonce generation tests ────────────────────────────────

    #[test]
    fn nonce_format() {
        let nonce = XiaomiClient::generate_nonce("AA:BB:CC:DD:EE:FF");
        assert!(nonce.starts_with("0_AA:BB:CC:DD:EE:FF_"));
        let parts: Vec<&str> = nonce.split('_').collect();
        assert_eq!(parts.len(), 4);
    }

    #[test]
    fn nonce_deterministic_random_from_timestamp() {
        let nonce = XiaomiClient::generate_nonce("28:D1:27:AB:CD:EF");
        let parts: Vec<&str> = nonce.split('_').collect();
        assert_eq!(parts[0], "0");
        assert_eq!(parts[1], "28:D1:27:AB:CD:EF");

        let timestamp: u64 = parts[2].parse().expect("timestamp should be a u64");
        let random: u32 = parts[3].parse().expect("random should be a u32");

        // The random component is derived as (timestamp as u32) ^ 0x1234_5678
        assert_eq!(random, (timestamp as u32) ^ 0x1234_5678);
    }

    #[test]
    fn nonce_same_device_id_produces_consistent_structure() {
        let n1 = XiaomiClient::generate_nonce("AA:BB:CC:DD:EE:FF");
        let n2 = XiaomiClient::generate_nonce("AA:BB:CC:DD:EE:FF");

        // Both should have the same prefix (type and device_id)
        assert!(n1.starts_with("0_AA:BB:CC:DD:EE:FF_"));
        assert!(n2.starts_with("0_AA:BB:CC:DD:EE:FF_"));

        // Both should have 4 parts
        assert_eq!(n1.split('_').count(), 4);
        assert_eq!(n2.split('_').count(), 4);
    }

    // ── Password hashing tests ────────────────────────────────

    #[test]
    fn hash_password_produces_correct_sha256() {
        let password = "admin";
        let key = "a2ffa5c9be07488bbb04a3a47d3c5f6a";
        let nonce = "0_AA:BB:CC:DD:EE:FF_1700000000_305419896";

        let hash = XiaomiClient::hash_password(password, key, nonce);

        // Verify exact expected value:
        // Step 1: SHA256("admin" + "a2ffa5c9be07488bbb04a3a47d3c5f6a")
        //       = 73a1d6d01003067844cd148b1502a24bb8a305c93dfef55f983da80fa8cdfa24
        // Step 2: SHA256(nonce + step1_hex)
        //       = 7266fe03192cf5bb2f2cdc40e70fc58680140e4a200e85bef8232d7b863be30c
        assert_eq!(
            hash,
            "7266fe03192cf5bb2f2cdc40e70fc58680140e4a200e85bef8232d7b863be30c"
        );
    }

    #[test]
    fn hash_password_different_inputs_produce_different_hashes() {
        let nonce = "0_AA:BB:CC:DD:EE:FF_1700000000_305419896";
        let key = "a2ffa5c9be07488bbb04a3a47d3c5f6a";

        let h1 = XiaomiClient::hash_password("admin", key, nonce);
        let h2 = XiaomiClient::hash_password("password123", key, nonce);
        assert_ne!(h1, h2);

        let h3 = XiaomiClient::hash_password("admin", "different_key", nonce);
        assert_ne!(h1, h3);

        let h4 = XiaomiClient::hash_password("admin", key, "different_nonce");
        assert_ne!(h1, h4);
    }

    #[test]
    fn hash_password_output_is_lowercase_hex_64_chars() {
        let hash = XiaomiClient::hash_password("test", "key", "nonce");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
        // SHA256 hex output should be lowercase
        assert_eq!(hash, hash.to_lowercase());
    }

    // ── topo_graph response parsing test ──────────────────────

    #[test]
    fn topo_graph_parses_be3600_fixture() {
        // Real-world fixture from Xiaomi BE3600 2.5G mesh router
        let payload = serde_json::json!({
            "code": 0,
            "graph": {
                "nodes": [
                    {
                        "mac": "28:D1:27:AB:CD:EF",
                        "name": "Xiaomi_BE3600",
                        "locale": "master",
                        "ip": "192.168.31.1",
                        "online": 1,
                        "hardware": "RB03",
                        "model": "xiaomi.router.rb03"
                    },
                    {
                        "mac": "28:D1:27:AB:CD:F0",
                        "name": "Xiaomi_BE3600_node",
                        "locale": "slave",
                        "ip": "192.168.31.2",
                        "online": 1,
                        "hardware": "RB03",
                        "model": "xiaomi.router.rb03"
                    }
                ],
                "leafs": [
                    {
                        "mac": "BC:24:11:BF:35:FB",
                        "ip": "192.168.31.100",
                        "name": "iPhone",
                        "online": 1,
                        "parentId": "28:D1:27:AB:CD:EF"
                    },
                    {
                        "mac": "AA:BB:CC:11:22:33",
                        "ip": "192.168.31.101",
                        "name": "Laptop",
                        "online": 1,
                        "parentId": "28:D1:27:AB:CD:EF"
                    },
                    {
                        "mac": "DD:EE:FF:44:55:66",
                        "ip": "192.168.31.102",
                        "name": "Smart-TV",
                        "online": 0,
                        "parentId": "28:D1:27:AB:CD:F0"
                    }
                ]
            }
        });

        let parsed: MiWiFiResponse<TopoGraph> =
            serde_json::from_value(payload).expect("topo_graph should parse");

        assert_eq!(parsed.code, 0);
        let graph = parsed.data.graph.expect("graph field should be present");

        // Verify mesh nodes
        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(graph.nodes[0].mac.as_deref(), Some("28:D1:27:AB:CD:EF"));
        assert_eq!(graph.nodes[0].locale.as_deref(), Some("master"));
        assert_eq!(graph.nodes[0].hardware.as_deref(), Some("RB03"));
        assert_eq!(graph.nodes[1].locale.as_deref(), Some("slave"));
        assert_eq!(graph.nodes[1].ip.as_deref(), Some("192.168.31.2"));

        // Verify leaf devices
        assert_eq!(graph.leafs.len(), 3);
        assert_eq!(graph.leafs[0].name.as_deref(), Some("iPhone"));
        assert_eq!(
            graph.leafs[0].parent_id.as_deref(),
            Some("28:D1:27:AB:CD:EF")
        );
        assert_eq!(graph.leafs[2].online, Some(0));
        assert_eq!(
            graph.leafs[2].parent_id.as_deref(),
            Some("28:D1:27:AB:CD:F0")
        );
    }

    #[test]
    fn topo_graph_handles_empty_graph() {
        let payload = serde_json::json!({
            "code": 0,
            "graph": {
                "nodes": [],
                "leafs": []
            }
        });

        let parsed: MiWiFiResponse<TopoGraph> =
            serde_json::from_value(payload).expect("empty topo_graph should parse");
        let graph = parsed.data.graph.expect("graph field should be present");
        assert!(graph.nodes.is_empty());
        assert!(graph.leafs.is_empty());
    }

    #[test]
    fn topo_graph_handles_missing_optional_fields() {
        let payload = serde_json::json!({
            "code": 0,
            "graph": {
                "nodes": [{
                    "mac": "28:D1:27:AB:CD:EF"
                }],
                "leafs": [{
                    "mac": "BC:24:11:BF:35:FB"
                }]
            }
        });

        let parsed: MiWiFiResponse<TopoGraph> =
            serde_json::from_value(payload).expect("sparse topo_graph should parse");
        let graph = parsed.data.graph.unwrap();
        assert_eq!(graph.nodes[0].mac.as_deref(), Some("28:D1:27:AB:CD:EF"));
        assert!(graph.nodes[0].name.is_none());
        assert!(graph.nodes[0].locale.is_none());
        assert!(graph.leafs[0].parent_id.is_none());
    }
}
