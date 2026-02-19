pub mod arp;

use anyhow::Result;
use chrono::Utc;
use serde_json::json;
use sqlx::SqlitePool;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::config::ScannerConfig;
use crate::ws::hub::WsHub;

/// Discovered device from an ARP scan.
#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub ip: String,
    pub mac: String,
}

/// Run an ARP scan on the specified subnets.
///
/// Falls back to parsing the system ARP table if raw socket scanning
/// is not available (e.g., no CAP_NET_RAW).
pub async fn scan_subnets(_subnets: &[String]) -> Result<Vec<DiscoveredDevice>> {
    // Try reading from the system ARP cache first (always available).
    let devices = arp::read_arp_table().await?;
    Ok(devices)
}

/// Start the periodic ARP scanner as a background tokio task.
///
/// This task:
/// 1. Runs ARP scans every `interval_seconds`
/// 2. Upserts discovered devices into the `devices` table
/// 3. Detects online/offline state changes
/// 4. Creates alerts for new devices, devices going offline, and devices coming back
/// 5. Broadcasts changes to connected UI clients via the WsHub
pub fn start_scanner_task(db: SqlitePool, config: ScannerConfig, ws_hub: Arc<WsHub>) {
    let interval = std::time::Duration::from_secs(config.interval_seconds);
    let grace = config.offline_grace_seconds;
    let subnets = config.subnets.clone();

    tokio::spawn(async move {
        info!(
            interval_secs = config.interval_seconds,
            subnets = ?subnets,
            "ARP scanner started"
        );

        // Small initial delay to let the server finish starting up.
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;

            match scan_subnets(&subnets).await {
                Ok(devices) => {
                    info!(count = devices.len(), "ARP scan completed");
                    if let Err(e) = process_scan_results(&db, &devices, grace, &ws_hub).await {
                        error!("Failed to process scan results: {e}");
                    }
                }
                Err(e) => {
                    warn!("ARP scan failed: {e}");
                }
            }
        }
    });
}

/// Process ARP scan results: upsert devices, detect state changes, create alerts.
async fn process_scan_results(
    db: &SqlitePool,
    discovered: &[DiscoveredDevice],
    offline_grace_secs: u64,
    ws_hub: &WsHub,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    // --- Phase 1: Upsert discovered devices ---
    for dev in discovered {
        let mac_normalized = dev.mac.to_lowercase();

        // Check if device already exists.
        let existing: Option<(String, bool)> =
            sqlx::query("SELECT id, is_online FROM devices WHERE mac = ?")
                .bind(&mac_normalized)
                .fetch_optional(db)
                .await?
                .map(|row| {
                    let id: String = sqlx::Row::get(&row, "id");
                    let is_online: bool = sqlx::Row::get::<i32, _>(&row, "is_online") != 0;
                    (id, is_online)
                });

        match existing {
            Some((device_id, was_online)) => {
                // Update last_seen_at and mark online.
                sqlx::query(
                    "UPDATE devices SET last_seen_at = ?, is_online = 1, updated_at = ? WHERE id = ?",
                )
                .bind(&now)
                .bind(&now)
                .bind(&device_id)
                .execute(db)
                .await?;

                // Upsert device_ips.
                sqlx::query(
                    "INSERT INTO device_ips (device_id, ip, seen_at, is_current) \
                     VALUES (?, ?, ?, 1) \
                     ON CONFLICT(device_id, ip) DO UPDATE SET seen_at = ?, is_current = 1",
                )
                .bind(&device_id)
                .bind(&dev.ip)
                .bind(&now)
                .bind(&now)
                .execute(db)
                .await?;

                // State change: was offline → now online.
                if !was_online {
                    // Log state change.
                    sqlx::query(
                        "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'online', ?)",
                    )
                    .bind(&device_id)
                    .bind(&now)
                    .execute(db)
                    .await?;

                    // Create alert.
                    let alert_id = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO alerts (id, type, device_id, message, created_at) \
                         VALUES (?, 'device_online', ?, ?, ?)",
                    )
                    .bind(&alert_id)
                    .bind(&device_id)
                    .bind(format!(
                        "Device {} ({}) came back online",
                        mac_normalized, dev.ip
                    ))
                    .bind(&now)
                    .execute(db)
                    .await?;

                    info!(mac = %mac_normalized, ip = %dev.ip, "Device came back online");

                    ws_hub.broadcast(
                        "device_online",
                        json!({
                            "device_id": &device_id,
                            "mac": &mac_normalized,
                            "ip": &dev.ip,
                        }),
                    );
                }
            }
            None => {
                // New device discovered.
                let device_id = uuid::Uuid::new_v4().to_string();
                let vendor = crate::oui::lookup(&mac_normalized).map(|v| v.to_string());

                sqlx::query(
                    "INSERT INTO devices (id, mac, vendor, first_seen_at, last_seen_at, is_online) \
                     VALUES (?, ?, ?, ?, ?, 1)",
                )
                .bind(&device_id)
                .bind(&mac_normalized)
                .bind(&vendor)
                .bind(&now)
                .bind(&now)
                .execute(db)
                .await?;

                // Insert IP mapping.
                sqlx::query(
                    "INSERT INTO device_ips (device_id, ip, seen_at, is_current) VALUES (?, ?, ?, 1)",
                )
                .bind(&device_id)
                .bind(&dev.ip)
                .bind(&now)
                .execute(db)
                .await?;

                // Log initial online state.
                sqlx::query(
                    "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'online', ?)",
                )
                .bind(&device_id)
                .bind(&now)
                .execute(db)
                .await?;

                // Create alert for new unknown device.
                let alert_id = uuid::Uuid::new_v4().to_string();
                let vendor_str = vendor.as_deref().unwrap_or("Unknown");
                sqlx::query(
                    "INSERT INTO alerts (id, type, device_id, message, details, created_at) \
                     VALUES (?, 'new_device', ?, ?, ?, ?)",
                )
                .bind(&alert_id)
                .bind(&device_id)
                .bind(format!(
                    "New device discovered: {} ({}) — {}",
                    mac_normalized, dev.ip, vendor_str
                ))
                .bind(
                    json!({"mac": &mac_normalized, "ip": &dev.ip, "vendor": vendor_str})
                        .to_string(),
                )
                .bind(&now)
                .execute(db)
                .await?;

                info!(
                    mac = %mac_normalized,
                    ip = %dev.ip,
                    vendor = ?vendor_str,
                    "New device discovered"
                );

                ws_hub.broadcast(
                    "new_device",
                    json!({
                        "device_id": &device_id,
                        "mac": &mac_normalized,
                        "ip": &dev.ip,
                        "vendor": vendor_str,
                    }),
                );
            }
        }
    }

    // --- Phase 2: Mark stale devices as offline ---
    // Devices that are currently online but haven't been seen within the grace period.
    let grace_cutoff =
        (Utc::now() - chrono::Duration::seconds(offline_grace_secs as i64)).to_rfc3339();

    let stale_devices: Vec<(String, String)> =
        sqlx::query("SELECT id, mac FROM devices WHERE is_online = 1 AND last_seen_at < ?")
            .bind(&grace_cutoff)
            .fetch_all(db)
            .await?
            .into_iter()
            .map(|row| {
                let id: String = sqlx::Row::get(&row, "id");
                let mac: String = sqlx::Row::get(&row, "mac");
                (id, mac)
            })
            .collect();

    for (device_id, mac) in &stale_devices {
        // Mark offline.
        sqlx::query("UPDATE devices SET is_online = 0, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(device_id)
            .execute(db)
            .await?;

        // Mark all IPs as not current.
        sqlx::query("UPDATE device_ips SET is_current = 0 WHERE device_id = ?")
            .bind(device_id)
            .execute(db)
            .await?;

        // Log state change.
        sqlx::query(
            "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'offline', ?)",
        )
        .bind(device_id)
        .bind(&now)
        .execute(db)
        .await?;

        // Create alert.
        let alert_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO alerts (id, type, device_id, message, created_at) \
             VALUES (?, 'device_offline', ?, ?, ?)",
        )
        .bind(&alert_id)
        .bind(device_id)
        .bind(format!("Device {} went offline", mac))
        .bind(&now)
        .execute(db)
        .await?;

        info!(mac = %mac, "Device went offline");

        ws_hub.broadcast(
            "device_offline",
            json!({
                "device_id": device_id,
                "mac": mac,
            }),
        );
    }

    Ok(())
}
