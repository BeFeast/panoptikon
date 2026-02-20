//! VyOS HTTP API client.
//!
//! Communicates with a VyOS router using its HTTP API.
//! Auth is via multipart form-data fields `key` and `data`.

use anyhow::{Context, Result};
use serde_json::Value;
use std::time::Duration;

/// A lightweight client for the VyOS HTTP API.
#[derive(Debug, Clone)]
pub struct VyosClient {
    base_url: String,
    api_key: String,
    http: reqwest::Client,
}

/// Parsed VyOS API response envelope.
#[derive(Debug, serde::Deserialize)]
struct VyosResponse {
    success: bool,
    data: Option<Value>,
    error: Option<Value>,
}

impl VyosClient {
    /// Create a new VyOS client.
    ///
    /// `base_url` should be the scheme + host, e.g. `"https://10.10.0.50"`.
    /// Self-signed certificates are accepted.
    pub fn new(base_url: &str, api_key: &str) -> Self {
        let http = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(10))
            .build()
            .expect("failed to build reqwest client for VyOS");

        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            http,
        }
    }

    /// POST /retrieve — read running configuration at `path`.
    pub async fn retrieve(&self, path: &[&str]) -> Result<Value> {
        let data = serde_json::json!({
            "op": "showConfig",
            "path": path,
        });
        self.post_form("/retrieve", &data).await
    }

    /// POST /show — run an operational-mode show command at `path`.
    pub async fn show(&self, path: &[&str]) -> Result<Value> {
        let data = serde_json::json!({
            "op": "show",
            "path": path,
        });
        self.post_form("/show", &data).await
    }

    /// Low-level helper: send a multipart form POST to the VyOS API.
    async fn post_form(&self, endpoint: &str, data: &Value) -> Result<Value> {
        let url = format!("{}{endpoint}", self.base_url);
        let data_str = serde_json::to_string(data)?;

        let form = reqwest::multipart::Form::new()
            .text("data", data_str)
            .text("key", self.api_key.clone());

        let resp = self
            .http
            .post(&url)
            .multipart(form)
            .send()
            .await
            .context("VyOS API request failed")?;

        let status = resp.status();
        let body = resp
            .text()
            .await
            .context("failed to read VyOS API response body")?;

        if !status.is_success() {
            anyhow::bail!("VyOS API returned HTTP {status}: {body}");
        }

        let parsed: VyosResponse =
            serde_json::from_str(&body).context("failed to parse VyOS API response JSON")?;

        if parsed.success {
            Ok(parsed.data.unwrap_or(Value::Null))
        } else {
            let err_msg = parsed
                .error
                .map(|e| e.to_string())
                .unwrap_or_else(|| "unknown error".to_string());
            anyhow::bail!("VyOS API error: {err_msg}");
        }
    }
}
