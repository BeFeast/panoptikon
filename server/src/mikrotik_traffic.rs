//! MikroTik interface traffic poller.
//!
//! Polls MikroTik router interface traffic counters every 60 seconds using
//! `/rest/interface/monitor-traffic`, maps the data to the router device in
//! the devices table, and inserts samples into `traffic_samples`.

use std::time::Duration;

use sqlx::SqlitePool;
use tracing::{debug, error, info};

use crate::mikrotik::client::MikrotikClient;

/// Polling interval: 1 minute.
const POLL_INTERVAL: Duration = Duration::from_secs(60);

/// Start the MikroTik traffic polling background task.
///
/// Spawns a tokio task that runs every 60 seconds:
/// 1. Reads MikroTik connection settings from the `settings` table.
/// 2. Fetches running interface list.
/// 3. Calls `monitor-traffic` on each running interface to get instantaneous bps.
/// 4. Finds the router device by its IP in `device_ips`.
/// 5. Inserts aggregated traffic into `traffic_samples` with `source = 'mikrotik'`.
pub fn start_mikrotik_traffic_poller(pool: SqlitePool, http: reqwest::Client) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(POLL_INTERVAL);
        // Skip the immediate first tick to let the system initialize.
        interval.tick().await;
        info!("MikroTik traffic poller started (60s interval)");

        loop {
            interval.tick().await;
            if let Err(e) = poll_once(&pool, &http).await {
                debug!("MikroTik traffic poll skipped: {e}");
            }
        }
    });
}

/// Read a setting value from the `settings` table.
async fn get_setting(pool: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Extract the host/IP from a URL string (e.g. "https://192.168.1.1" → "192.168.1.1").
fn extract_host_from_url(url: &str) -> Option<String> {
    // Require a scheme (http:// or https://).
    let after_scheme = url.split("://").nth(1)?;
    // Strip path and port.
    let host = after_scheme.split('/').next()?;
    let host = host.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// Look up a device_id by IP address.
async fn lookup_device_by_ip(pool: &SqlitePool, ip: &str) -> Option<String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT device_id FROM device_ips WHERE ip = ? AND is_current = 1 LIMIT 1")
            .bind(ip)
            .fetch_optional(pool)
            .await
            .ok()?;
    row.map(|(id,)| id)
}

/// Run a single poll cycle.
async fn poll_once(pool: &SqlitePool, http: &reqwest::Client) -> anyhow::Result<()> {
    // Check if MikroTik integration is enabled.
    let enabled = get_setting(pool, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return Ok(());
    }

    let url = get_setting(pool, "mikrotik_url")
        .await
        .ok_or_else(|| anyhow::anyhow!("mikrotik_url not configured"))?;
    let user = get_setting(pool, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(pool, "mikrotik_password")
        .await
        .unwrap_or_default();

    let client = MikrotikClient::with_http(&url, &user, &password, http.clone());

    // Find the router device by its IP address.
    let router_ip = extract_host_from_url(&url)
        .ok_or_else(|| anyhow::anyhow!("cannot extract IP from mikrotik_url"))?;
    let device_id = lookup_device_by_ip(pool, &router_ip)
        .await
        .ok_or_else(|| anyhow::anyhow!("router device not found for IP {router_ip}"))?;

    // Get list of interfaces to find running ones.
    let interfaces = client.interfaces().await?;

    let mut total_rx_bps: i64 = 0;
    let mut total_tx_bps: i64 = 0;
    let mut polled_count = 0u32;

    for iface in &interfaces {
        let running = iface.running.as_deref() == Some("true");
        let disabled = iface.disabled.as_deref() == Some("true");
        if !running || disabled {
            continue;
        }

        let name = match &iface.name {
            Some(n) => n.as_str(),
            None => continue,
        };

        // Skip loopback and virtual interfaces that don't carry real traffic.
        let iface_type = iface.iface_type.as_deref().unwrap_or("");
        if iface_type == "loopback" {
            continue;
        }

        // Call monitor-traffic to get instantaneous bps for this interface.
        match client.monitor_traffic(name).await {
            Ok(results) => {
                for r in &results {
                    let rx: i64 = r
                        .rx_bits_per_second
                        .as_deref()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    let tx: i64 = r
                        .tx_bits_per_second
                        .as_deref()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    total_rx_bps += rx;
                    total_tx_bps += tx;
                }
                polled_count += 1;
            }
            Err(e) => {
                debug!(interface = name, "monitor-traffic failed: {e}");
            }
        }
    }

    if polled_count == 0 {
        return Ok(());
    }

    // Skip zero-traffic samples to avoid DB bloat.
    if total_rx_bps == 0 && total_tx_bps == 0 {
        return Ok(());
    }

    // Insert aggregated traffic sample.
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    sqlx::query(
        r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
           VALUES (?, ?, ?, ?, 'mikrotik')"#,
    )
    .bind(&device_id)
    .bind(&now)
    .bind(total_rx_bps)
    .bind(total_tx_bps)
    .execute(pool)
    .await
    .map_err(|e| {
        error!("Failed to insert MikroTik traffic sample: {e}");
        e
    })?;

    info!(
        rx_bps = total_rx_bps,
        tx_bps = total_tx_bps,
        interfaces = polled_count,
        "MikroTik traffic sample stored"
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_host_from_url() {
        assert_eq!(
            extract_host_from_url("https://192.168.1.1"),
            Some("192.168.1.1".to_string())
        );
        assert_eq!(
            extract_host_from_url("https://192.168.1.1:443"),
            Some("192.168.1.1".to_string())
        );
        assert_eq!(
            extract_host_from_url("http://router.local"),
            Some("router.local".to_string())
        );
        assert_eq!(extract_host_from_url("not-a-url"), None);
    }

    #[tokio::test]
    async fn test_poll_skips_when_not_enabled() {
        let pool = crate::db::init(":memory:").await.expect("DB init failed");

        // mikrotik_enabled is not set, so poll_once should return Ok(())
        let http = reqwest::Client::new();
        let result = poll_once(&pool, &http).await;
        assert!(result.is_ok());
    }
}
