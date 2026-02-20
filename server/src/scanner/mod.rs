pub mod arp;

use anyhow::Result;
use chrono::Utc;
use hickory_resolver::TokioAsyncResolver;
use serde_json::json;
use sqlx::SqlitePool;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, error, info, warn};

use crate::api::alerts::{is_device_muted, severity_for_alert_type};
use crate::config::ScannerConfig;
use crate::webhook;
use crate::ws::hub::WsHub;

/// Discovered device from an ARP scan.
#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub ip: String,
    pub mac: String,
}

/// Run an ARP scan on the specified subnets.
///
/// First performs an active ping sweep on each configured subnet to populate
/// the kernel ARP table with entries for all reachable hosts, then reads the
/// ARP table. This discovers devices that would otherwise be invisible to
/// passive ARP cache reading.
pub async fn scan_subnets(
    subnets: &[String],
    arp_settle_millis: u64,
) -> Result<Vec<DiscoveredDevice>> {
    // Phase 0: Active ping sweep — populate the ARP table.
    for subnet in subnets {
        arp::ping_sweep(subnet).await;
    }

    // Wait for the kernel to finish updating ARP entries.
    // Duration is configurable via panoptikon.toml [scanner] arp_settle_millis.
    if arp_settle_millis > 0 {
        tokio::time::sleep(Duration::from_millis(arp_settle_millis)).await;
    }

    // Phase 1: Read the (now enriched) ARP cache.
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
    let arp_settle_millis = config.arp_settle_millis;

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

            match scan_subnets(&subnets, arp_settle_millis).await {
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

/// Perform a reverse DNS (PTR) lookup for the given IP address.
///
/// Returns `Some(hostname)` on success, `None` if the lookup fails or times out.
/// Uses a 2-second timeout. The underlying lookup is fully async via
/// `hickory-resolver`, so dropping the future on timeout actually cancels
/// the in-flight DNS query (no lingering background threads).
async fn reverse_dns_lookup(resolver: &TokioAsyncResolver, ip: &str) -> Option<String> {
    let addr: IpAddr = match ip.parse() {
        Ok(a) => a,
        Err(_) => return None,
    };

    let result = tokio::time::timeout(Duration::from_secs(2), resolver.reverse_lookup(addr)).await;

    match result {
        Ok(Ok(lookup)) => {
            let hostname = lookup.iter().next()?.to_string();
            // Strip trailing dot from FQDN (e.g. "router.local." → "router.local").
            let hostname = hostname.trim_end_matches('.').to_string();
            // Skip if the hostname is just the IP address repeated back.
            if hostname == ip {
                None
            } else {
                Some(hostname)
            }
        }
        Ok(Err(e)) => {
            debug!(ip = %ip, error = %e, "Reverse DNS lookup failed");
            None
        }
        Err(_) => {
            debug!(ip = %ip, "Reverse DNS lookup timed out");
            None
        }
    }
}

/// Maximum number of concurrent reverse DNS lookups.
const DNS_CONCURRENCY_LIMIT: usize = 16;

/// Update the hostname column for a device after reverse DNS resolution.
async fn update_hostname(
    db: &SqlitePool,
    device_id: &str,
    ip: &str,
    hostname: Option<&str>,
    now: &str,
) {
    match hostname {
        Some(hostname) => {
            if let Err(e) = sqlx::query(
                "UPDATE devices SET hostname = ?, updated_at = ? WHERE id = ? AND (hostname IS NULL OR hostname != ?)",
            )
            .bind(hostname)
            .bind(now)
            .bind(device_id)
            .bind(hostname)
            .execute(db)
            .await
            {
                warn!(ip = %ip, error = %e, "Failed to update hostname in DB");
            } else {
                debug!(ip = %ip, hostname = %hostname, "Reverse DNS resolved");
            }
        }
        None => {
            debug!(ip = %ip, "Reverse DNS lookup returned no result");
        }
    }
}

/// Process ARP scan results: upsert devices, detect state changes, create alerts.
async fn process_scan_results(
    db: &SqlitePool,
    discovered: &[DiscoveredDevice],
    offline_grace_secs: u64,
    ws_hub: &WsHub,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    // Pairs of (device_id, ip) collected during upsert for batch DNS resolution.
    let mut dns_targets: Vec<(String, String)> = Vec::new();

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

        let device_id = match existing {
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

                    // Record event in device_events history.
                    sqlx::query(
                        r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'online', ?)"#,
                    )
                    .bind(&device_id)
                    .bind(&now)
                    .execute(db)
                    .await?;

                    // Create alert (skip if device is muted).
                    if !is_device_muted(db, &device_id).await {
                        let alert_id = uuid::Uuid::new_v4().to_string();
                        let severity = severity_for_alert_type("device_online");
                        sqlx::query(
                            r#"INSERT INTO alerts (id, type, device_id, message, severity, created_at)
                             VALUES (?, 'device_online', ?, ?, ?, ?)"#,
                        )
                        .bind(&alert_id)
                        .bind(&device_id)
                        .bind(format!(
                            "Device {} ({}) came back online",
                            mac_normalized, dev.ip
                        ))
                        .bind(severity)
                        .bind(&now)
                        .execute(db)
                        .await?;
                    }

                    info!(mac = %mac_normalized, ip = %dev.ip, "Device came back online");

                    ws_hub.broadcast(
                        "device_online",
                        json!({
                            "device_id": &device_id,
                            "mac": &mac_normalized,
                            "ip": &dev.ip,
                        }),
                    );

                    webhook::dispatch_webhook(
                        db,
                        "device_online",
                        json!({
                            "device_id": &device_id,
                            "mac": &mac_normalized,
                            "ip": &dev.ip,
                        }),
                    );
                }

                device_id
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

                // Record initial online event in device_events history.
                sqlx::query(
                    r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'online', ?)"#,
                )
                .bind(&device_id)
                .bind(&now)
                .execute(db)
                .await?;

                // Create alert for new unknown device.
                let alert_id = uuid::Uuid::new_v4().to_string();
                let vendor_str = vendor.as_deref().unwrap_or("Unknown");
                let severity = severity_for_alert_type("new_device");
                sqlx::query(
                    r#"INSERT INTO alerts (id, type, device_id, message, details, severity, created_at)
                     VALUES (?, 'new_device', ?, ?, ?, ?, ?)"#,
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
                .bind(severity)
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

                webhook::dispatch_webhook(
                    db,
                    "new_device",
                    json!({
                        "device_id": &device_id,
                        "mac": &mac_normalized,
                        "ip": &dev.ip,
                        "vendor": vendor_str,
                    }),
                );

                device_id
            }
        };

        dns_targets.push((device_id, dev.ip.clone()));
    }

    // --- Phase 1b: Batch reverse DNS lookups with bounded concurrency ---
    // Deduplicate by device_id in case the same device appeared more than once in the scan.
    dns_targets.sort_unstable_by(|a, b| a.0.cmp(&b.0));
    dns_targets.dedup_by(|a, b| a.0 == b.0);

    // If the system resolver config cannot be loaded, skip DNS entirely — the default
    // resolver (8.8.8.8 / 1.1.1.1) will not resolve local PTR records anyway.
    let dns_resolver = match TokioAsyncResolver::tokio_from_system_conf() {
        Ok(r) => Some(r),
        Err(e) => {
            warn!(error = %e, "Failed to load system DNS config; skipping reverse DNS for this scan cycle");
            None
        }
    };

    if !dns_targets.is_empty() {
        if let Some(resolver) = dns_resolver {
            let resolver = Arc::new(resolver);

            let mut join_set: JoinSet<(String, String, Option<String>)> = JoinSet::new();

            for (device_id, ip) in dns_targets {
                // Limit concurrency: when at the cap, wait for one to finish before spawning.
                if join_set.len() >= DNS_CONCURRENCY_LIMIT {
                    match join_set.join_next().await {
                        Some(Ok((did, dip, hostname))) => {
                            update_hostname(db, &did, &dip, hostname.as_deref(), &now).await;
                        }
                        Some(Err(e)) => warn!(error = %e, "DNS lookup task failed"),
                        None => {}
                    }
                }

                let resolver = Arc::clone(&resolver);
                join_set.spawn(async move {
                    let hostname = reverse_dns_lookup(&resolver, &ip).await;
                    (device_id, ip, hostname)
                });
            }

            // Drain remaining tasks.
            while let Some(result) = join_set.join_next().await {
                match result {
                    Ok((device_id, ip, hostname)) => {
                        update_hostname(db, &device_id, &ip, hostname.as_deref(), &now).await;
                    }
                    Err(e) => warn!(error = %e, "DNS lookup task failed"),
                }
            }
        } // end if let Some(resolver)
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

        // Record offline event in device_events history.
        sqlx::query(
            r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'offline', ?)"#,
        )
        .bind(device_id)
        .bind(&now)
        .execute(db)
        .await?;

        // Create alert (skip if device is muted).
        if !is_device_muted(db, device_id).await {
            let alert_id = uuid::Uuid::new_v4().to_string();
            let severity = severity_for_alert_type("device_offline");
            sqlx::query(
                r#"INSERT INTO alerts (id, type, device_id, message, severity, created_at)
                 VALUES (?, 'device_offline', ?, ?, ?, ?)"#,
            )
            .bind(&alert_id)
            .bind(device_id)
            .bind(format!("Device {} went offline", mac))
            .bind(severity)
            .bind(&now)
            .execute(db)
            .await?;
        }

        info!(mac = %mac, "Device went offline");

        ws_hub.broadcast(
            "device_offline",
            json!({
                "device_id": device_id,
                "mac": mac,
            }),
        );

        webhook::dispatch_webhook(
            db,
            "device_offline",
            json!({
                "device_id": device_id,
                "mac": mac,
            }),
        );
    }

    Ok(())
}
