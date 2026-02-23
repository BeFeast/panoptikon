//! Caddy JSON Admin API client.
//!
//! Talks to the Caddy Admin API at `localhost:2019` to manage reverse proxy
//! routes. Panoptikon stores host definitions in SQLite as the source of truth
//! and syncs the full config to Caddy via `POST /load`.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{error, info};

/// A proxy host definition stored in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaddyProxyHost {
    pub id: String,
    pub domain: String,
    pub upstream: String,
    pub enabled: bool,
    pub ssl_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Status response for the Caddy connection check.
#[derive(Debug, Serialize)]
pub struct CaddyStatus {
    pub configured: bool,
    pub reachable: bool,
    pub host_count: Option<usize>,
}

/// Build a shared `reqwest::Client` for Caddy Admin API calls.
pub fn shared_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .pool_max_idle_per_host(2)
        .build()
        .expect("failed to build shared reqwest client for Caddy")
}

/// Build the full Caddy JSON config from enabled proxy hosts.
///
/// Creates a config that Caddy understands via its `POST /load` endpoint.
/// Each enabled host becomes a route in the HTTP app.
fn build_caddy_config(admin_url: &str, hosts: &[CaddyProxyHost]) -> serde_json::Value {
    let routes: Vec<serde_json::Value> = hosts
        .iter()
        .filter(|h| h.enabled)
        .map(|h| {
            serde_json::json!({
                "match": [{
                    "host": [h.domain]
                }],
                "handle": [{
                    "handler": "reverse_proxy",
                    "upstreams": [{
                        "dial": h.upstream
                    }]
                }]
            })
        })
        .collect();

    // Extract listen port from admin_url or default to admin on :2019.
    // The HTTP server listens on :80/:443, admin on configured port.
    serde_json::json!({
        "admin": {
            "listen": admin_url.replace("http://", "")
        },
        "apps": {
            "http": {
                "servers": {
                    "proxy": {
                        "listen": [":80"],
                        "routes": routes
                    }
                }
            }
        }
    })
}

/// Sync the full set of enabled proxy hosts to Caddy via `POST /load`.
pub async fn sync_to_caddy(
    http: &reqwest::Client,
    admin_url: &str,
    hosts: &[CaddyProxyHost],
) -> Result<()> {
    let config = build_caddy_config(admin_url, hosts);

    let resp = http
        .post(format!("{}/load", admin_url))
        .header("Content-Type", "application/json")
        .json(&config)
        .send()
        .await
        .context("Caddy POST /load request failed")?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Caddy POST /load failed (HTTP {status}): {body}");
    }

    info!(
        host_count = hosts.iter().filter(|h| h.enabled).count(),
        "Synced config to Caddy"
    );
    Ok(())
}

/// Check if Caddy Admin API is reachable.
pub async fn check_status(http: &reqwest::Client, admin_url: &str) -> CaddyStatus {
    let resp = http.get(format!("{}/config/", admin_url)).send().await;

    match resp {
        Ok(r) if r.status().is_success() => CaddyStatus {
            configured: true,
            reachable: true,
            host_count: None, // Will be filled from DB
        },
        Ok(_) => CaddyStatus {
            configured: true,
            reachable: false,
            host_count: None,
        },
        Err(e) => {
            error!("Caddy health check failed: {e}");
            CaddyStatus {
                configured: true,
                reachable: false,
                host_count: None,
            }
        }
    }
}
