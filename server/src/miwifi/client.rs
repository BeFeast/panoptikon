//! Xiaomi MiWiFi mesh router API client.
//!
//! Communicates with a Xiaomi router using its LuCI-based HTTP API.
//! Authentication uses the standard MiWiFi password hashing flow
//! (SHA1 with a well-known key constant).

use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

/// Well-known key constant used in MiWiFi password hashing.
const MIWIFI_KEY: &str = "a2ffa5c9be07488bbb04a3a47d3c5f6a";

/// Build the shared `reqwest::Client` for MiWiFi API calls.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(2)
        .tcp_keepalive(Duration::from_secs(30))
        .build()
        .expect("failed to build shared reqwest client for MiWiFi")
}

/// A MiWiFi client with optional cached stok token.
pub struct MiWiFiClient {
    base_url: String,
    password: String,
    http: reqwest::Client,
    stok: RwLock<Option<String>>,
}

// ── API response types ──────────────────────────────────────

#[derive(Debug, Deserialize)]
struct LoginResponse {
    code: i32,
    token: Option<String>,
}

/// WiFi client from `wifi_connect_devices` API.
#[derive(Debug, Clone, Deserialize)]
pub struct WifiClient {
    pub mac: Option<String>,
    #[serde(rename = "wifiIndex")]
    pub wifi_index: Option<i32>,
    pub signal: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct WifiConnectDevicesResponse {
    code: i32,
    list: Option<Vec<WifiClient>>,
}

/// Device from `devicelist` API.
#[derive(Debug, Clone, Deserialize)]
pub struct MiWiFiDevice {
    pub mac: Option<String>,
    pub ip: Option<Vec<MiWiFiDeviceIp>>,
    pub oname: Option<String>,
    #[serde(rename = "type")]
    pub device_type: Option<i32>,
    pub parent: Option<String>,
    pub online: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MiWiFiDeviceIp {
    pub ip: Option<String>,
    pub online: Option<String>,
    pub downspeed: Option<String>,
    pub upspeed: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeviceListResponse {
    code: i32,
    list: Option<Vec<MiWiFiDevice>>,
}

// ── Client implementation ───────────────────────────────────

impl MiWiFiClient {
    pub fn new(base_url: &str, password: &str, http: reqwest::Client) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            password: password.to_string(),
            http,
            stok: RwLock::new(None),
        }
    }

    /// Generate a nonce for MiWiFi login.
    fn generate_nonce() -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let random_val = pseudo_random();
        format!("0_web_{timestamp}_{random_val}")
    }

    /// Hash the password for MiWiFi auth.
    ///
    /// Algorithm: SHA1(nonce + SHA1(password + KEY))
    fn hash_password(password: &str, nonce: &str) -> String {
        use sha1::{Digest, Sha1};

        // Step 1: SHA1(password + key)
        let mut h1 = Sha1::new();
        h1.update(password.as_bytes());
        h1.update(MIWIFI_KEY.as_bytes());
        let hash1 = format!("{:x}", h1.finalize());

        // Step 2: SHA1(nonce + hash1)
        let mut h2 = Sha1::new();
        h2.update(nonce.as_bytes());
        h2.update(hash1.as_bytes());
        format!("{:x}", h2.finalize())
    }

    /// Login to the router and get a stok token.
    async fn login(&self) -> Result<String> {
        let nonce = Self::generate_nonce();
        let password_hash = Self::hash_password(&self.password, &nonce);

        let url = format!("{}/cgi-bin/luci/api/xqsystem/login", self.base_url);

        let resp = self
            .http
            .post(&url)
            .form(&[
                ("username", "admin"),
                ("password", password_hash.as_str()),
                ("logtype", "2"),
                ("nonce", nonce.as_str()),
            ])
            .send()
            .await
            .context("MiWiFi login request failed")?;

        let body: LoginResponse = resp
            .json()
            .await
            .context("failed to parse MiWiFi login response")?;

        if body.code != 0 {
            anyhow::bail!("MiWiFi login failed with code {}", body.code);
        }

        body.token.context("MiWiFi login response missing token")
    }

    /// Get or refresh the stok token.
    async fn get_stok(&self) -> Result<String> {
        {
            let guard = self.stok.read().await;
            if let Some(ref token) = *guard {
                return Ok(token.clone());
            }
        }

        let token = self.login().await?;
        {
            let mut guard = self.stok.write().await;
            *guard = Some(token.clone());
        }
        Ok(token)
    }

    /// Clear cached token (e.g., on auth failure).
    async fn clear_stok(&self) {
        let mut guard = self.stok.write().await;
        *guard = None;
    }

    /// Make an authenticated API GET call. Retries once on auth failure.
    async fn api_get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let stok = self.get_stok().await?;
        let url = format!("{}/cgi-bin/luci/;stok={}/api/{}", self.base_url, stok, path);

        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .context("MiWiFi API request failed")?;

        let text = resp
            .text()
            .await
            .context("failed to read MiWiFi API response")?;

        // Check for auth error — token may have expired.
        if text.contains("\"code\":401") || text.contains("\"code\": 401") {
            self.clear_stok().await;
            let stok = self.get_stok().await?;
            let url = format!("{}/cgi-bin/luci/;stok={}/api/{}", self.base_url, stok, path);
            let resp = self
                .http
                .get(&url)
                .send()
                .await
                .context("MiWiFi API retry request failed")?;
            let text = resp.text().await?;
            serde_json::from_str(&text).context("failed to parse MiWiFi API response after retry")
        } else {
            serde_json::from_str(&text).context("failed to parse MiWiFi API response")
        }
    }

    /// Fetch WiFi connected clients with signal strength and band info.
    pub async fn wifi_connect_devices(&self) -> Result<Vec<WifiClient>> {
        let resp: WifiConnectDevicesResponse =
            self.api_get("xqnetwork/wifi_connect_devices").await?;
        if resp.code != 0 {
            anyhow::bail!("wifi_connect_devices returned code {}", resp.code);
        }
        Ok(resp.list.unwrap_or_default())
    }

    /// Fetch full device list with parent mesh node info.
    pub async fn device_list(&self) -> Result<Vec<MiWiFiDevice>> {
        let resp: DeviceListResponse = self.api_get("misystem/devicelist").await?;
        if resp.code != 0 {
            anyhow::bail!("devicelist returned code {}", resp.code);
        }
        Ok(resp.list.unwrap_or_default())
    }
}

/// Cheap pseudo-random u32 for nonce generation (no crypto requirements).
fn pseudo_random() -> u32 {
    let s = RandomState::new();
    let mut hasher = s.build_hasher();
    hasher.write_u64(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64,
    );
    (hasher.finish() % 10000) as u32
}
