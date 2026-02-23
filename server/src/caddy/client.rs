//! Caddy Admin API client.
//!
//! Communicates with Caddy's JSON Admin API (default `localhost:2019`)
//! to push reverse proxy configuration built from the SQLite source of truth.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// A proxy host definition stored in SQLite and synced to Caddy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaddyProxyHost {
    pub id: String,
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub enabled: bool,
    pub ssl_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Connection status returned by the status endpoint.
#[derive(Debug, Serialize, Deserialize)]
pub struct CaddyConnectionStatus {
    pub configured: bool,
    pub reachable: bool,
    pub version: Option<String>,
}

/// Create a shared `reqwest::Client` for Caddy API calls.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("Failed to build Caddy HTTP client")
}

/// Test connectivity to the Caddy Admin API.
pub async fn test_connection(
    http: &reqwest::Client,
    base_url: &str,
) -> Result<CaddyConnectionStatus> {
    let url = format!("{}/config/", base_url.trim_end_matches('/'));
    let resp = http
        .get(&url)
        .send()
        .await
        .context("Failed to connect to Caddy Admin API")?;

    if resp.status().is_success() {
        Ok(CaddyConnectionStatus {
            configured: true,
            reachable: true,
            version: None,
        })
    } else {
        Ok(CaddyConnectionStatus {
            configured: true,
            reachable: false,
            version: None,
        })
    }
}

/// Build the Caddy HTTP app config from a list of enabled proxy hosts
/// and PATCH it to Caddy via `PATCH /config/apps/http`.
pub async fn sync_to_caddy(
    http: &reqwest::Client,
    base_url: &str,
    hosts: &[CaddyProxyHost],
) -> Result<()> {
    let enabled_hosts: Vec<&CaddyProxyHost> = hosts.iter().filter(|h| h.enabled).collect();

    // Build Caddy route entries for each enabled host.
    let routes: Vec<serde_json::Value> = enabled_hosts
        .iter()
        .map(|h| {
            let dial = format!("{}:{}", h.forward_host, h.forward_port);
            serde_json::json!({
                "match": [{
                    "host": [h.domain]
                }],
                "handle": [{
                    "handler": "reverse_proxy",
                    "upstreams": [{
                        "dial": dial
                    }],
                    "transport": {
                        "protocol": "http"
                    }
                }]
            })
        })
        .collect();

    // Build the HTTP app config with a single server listening on :443 and :80.
    let http_app = if routes.is_empty() {
        // Empty config — no servers.
        serde_json::json!({})
    } else {
        serde_json::json!({
            "servers": {
                "panoptikon": {
                    "listen": [":443", ":80"],
                    "routes": routes
                }
            }
        })
    };

    let url = format!("{}/config/apps/http", base_url.trim_end_matches('/'));
    let resp = http
        .patch(&url)
        .header("Content-Type", "application/json")
        .json(&http_app)
        .send()
        .await
        .context("Failed to PATCH Caddy config")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Caddy PATCH failed ({}): {}", status, body);
    }

    Ok(())
}
