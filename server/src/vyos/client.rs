use anyhow::Result;
use serde_json::{json, Value};

/// Client for the VyOS HTTP API.
///
/// VyOS exposes a REST-ish API (since 1.3) for show commands and configuration.
/// All requests are POST with a JSON body containing `op` and `path` fields,
/// plus a `key` query parameter for authentication.
#[derive(Debug, Clone)]
pub struct VyosClient {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

impl VyosClient {
    /// Create a new VyOS API client.
    pub fn new(base_url: &str, api_key: &str) -> Self {
        let http = reqwest::Client::builder()
            .danger_accept_invalid_certs(true) // VyOS often uses self-signed certs
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            http,
        }
    }

    /// Execute a VyOS `show` command.
    ///
    /// Example: `client.show(&["interfaces"])` → `POST /show` with `{"op": "show", "path": ["interfaces"]}`
    pub async fn show(&self, path: &[&str]) -> Result<Value> {
        let url = format!("{}/show", self.base_url);
        let body = json!({
            "op": "show",
            "path": path,
        });

        let response = self
            .http
            .post(&url)
            .query(&[("key", &self.api_key)])
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("VyOS API returned {status}: {text}");
        }

        let value: Value = response.json().await?;
        Ok(value)
    }

    /// Execute a VyOS `retrieve` command (for configuration queries).
    pub async fn retrieve(&self, path: &[&str]) -> Result<Value> {
        let url = format!("{}/retrieve", self.base_url);
        let body = json!({
            "op": "showConfig",
            "path": path,
        });

        let response = self
            .http
            .post(&url)
            .query(&[("key", &self.api_key)])
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            anyhow::bail!("VyOS API returned {status}: {text}");
        }

        let value: Value = response.json().await?;
        Ok(value)
    }
}
