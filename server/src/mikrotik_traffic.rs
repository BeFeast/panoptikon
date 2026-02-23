//! MikroTik interface traffic poller.
//!
//! Periodically fetches interface byte counters from MikroTik via REST API,
//! computes per-interval deltas, maps interfaces to devices by MAC address,
//! and inserts traffic samples into `traffic_samples` with `source = 'mikrotik'`.
//!
//! Resolution: 1-minute polling interval.

use sqlx::SqlitePool;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};

use crate::mikrotik::client::MikrotikClient;

/// Polling interval in seconds.
const POLL_INTERVAL_SECS: u64 = 60;

/// Previous snapshot of interface byte counters.
struct InterfaceSnapshot {
    tx_bytes: u64,
    rx_bytes: u64,
    timestamp: Instant,
}

/// Read a string setting from the settings table.
async fn get_setting(pool: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Try to construct a MikroTik client from DB settings.
/// Returns `None` if MikroTik is not enabled/configured.
async fn build_client(pool: &SqlitePool, http: &reqwest::Client) -> Option<MikrotikClient> {
    let enabled = get_setting(pool, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting(pool, "mikrotik_url").await?;
    let user = get_setting(pool, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(pool, "mikrotik_password")
        .await
        .unwrap_or_default();

    Some(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        http.clone(),
    ))
}

/// Look up device_id by MAC address (case-insensitive).
async fn device_id_by_mac(pool: &SqlitePool, mac: &str) -> Option<String> {
    let mac_upper = mac.to_uppercase();
    sqlx::query_scalar::<_, String>("SELECT id FROM devices WHERE UPPER(mac) = ?")
        .bind(&mac_upper)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

/// Insert a traffic sample for a device.
async fn insert_sample(pool: &SqlitePool, device_id: &str, tx_bps: i64, rx_bps: i64) {
    let result = sqlx::query(
        r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
           VALUES (?, datetime('now'), ?, ?, 'mikrotik')"#,
    )
    .bind(device_id)
    .bind(tx_bps)
    .bind(rx_bps)
    .execute(pool)
    .await;

    if let Err(e) = result {
        error!(device_id, "Failed to insert MikroTik traffic sample: {e}");
    }
}

/// Start the MikroTik traffic polling task.
///
/// Runs in the background, polling every 60 seconds.
/// Skips silently if MikroTik is not configured/enabled.
pub fn start_mikrotik_traffic_poller(pool: SqlitePool, http: reqwest::Client) {
    tokio::spawn(async move {
        info!("MikroTik traffic poller started (interval: {POLL_INTERVAL_SECS}s)");

        let mut prev_counters: HashMap<String, InterfaceSnapshot> = HashMap::new();
        let mut interval = tokio::time::interval(Duration::from_secs(POLL_INTERVAL_SECS));

        loop {
            interval.tick().await;

            // Try to build a client — skip this cycle if not configured.
            let Some(client) = build_client(&pool, &http).await else {
                // Clear previous counters so we don't compute stale deltas
                // when MikroTik gets re-enabled.
                if !prev_counters.is_empty() {
                    prev_counters.clear();
                }
                continue;
            };

            // Fetch interfaces from MikroTik.
            let ifaces = match client.interfaces().await {
                Ok(ifaces) => ifaces,
                Err(e) => {
                    warn!("MikroTik traffic poll failed: {e}");
                    continue;
                }
            };

            let now = Instant::now();
            let mut new_counters: HashMap<String, InterfaceSnapshot> = HashMap::new();
            let mut samples_inserted = 0u32;

            for iface in &ifaces {
                let name = match &iface.name {
                    Some(n) => n.clone(),
                    None => continue,
                };

                // Parse current byte counters.
                let tx_bytes: u64 = iface
                    .tx_byte
                    .as_deref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                let rx_bytes: u64 = iface
                    .rx_byte
                    .as_deref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);

                // Store current counters for next iteration.
                new_counters.insert(
                    name.clone(),
                    InterfaceSnapshot {
                        tx_bytes,
                        rx_bytes,
                        timestamp: now,
                    },
                );

                // Compute delta from previous poll.
                let Some(prev) = prev_counters.get(&name) else {
                    // First poll — no delta to compute.
                    continue;
                };

                let elapsed_secs = prev.timestamp.elapsed().as_secs_f64();
                if elapsed_secs < 1.0 {
                    continue;
                }

                // Handle counter wraparound (unlikely but safe).
                let tx_delta = tx_bytes.saturating_sub(prev.tx_bytes);
                let rx_delta = rx_bytes.saturating_sub(prev.rx_bytes);

                // Skip if no traffic.
                if tx_delta == 0 && rx_delta == 0 {
                    continue;
                }

                // Convert bytes delta to bits per second.
                let tx_bps = ((tx_delta as f64 * 8.0) / elapsed_secs) as i64;
                let rx_bps = ((rx_delta as f64 * 8.0) / elapsed_secs) as i64;

                // Find the device by interface MAC address.
                let mac = match &iface.mac_address {
                    Some(m) if !m.is_empty() => m,
                    _ => continue,
                };

                if let Some(device_id) = device_id_by_mac(&pool, mac).await {
                    insert_sample(&pool, &device_id, tx_bps, rx_bps).await;
                    samples_inserted += 1;
                }
            }

            if samples_inserted > 0 {
                debug!(
                    samples = samples_inserted,
                    "MikroTik traffic poller: inserted samples"
                );
            }

            prev_counters = new_counters;
        }
    });
}
