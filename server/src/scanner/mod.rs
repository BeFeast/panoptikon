pub mod arp;
pub mod device_identify;
pub mod http_fingerprint;
pub mod netbios;
pub mod nmap;
pub mod port_scanner;
pub mod snmp;

use anyhow::Result;
use chrono::Utc;
use hickory_resolver::TokioAsyncResolver;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, error, info, warn};

use crate::api::alerts::{is_device_muted, recent_alert_exists, severity_for_alert_type};
use crate::config::ScannerConfig;

/// Enrichment target tuple: (device_id, ip, mac, hostname, vendor, mdns_services).
type EnrichmentTarget = (
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
);
use crate::webhook;
use crate::ws::hub::WsHub;

/// Summary of a network scan operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanSummary {
    pub new_devices: u32,
    pub updated_devices: u32,
    pub offline_devices: u32,
    pub total_scanned: u32,
    /// Which scanner sources were used.
    pub sources: Vec<String>,
}

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
                "UPDATE devices SET hostname = ?, name = COALESCE(name, ?), is_known = 1, updated_at = ? WHERE id = ? AND (hostname IS NULL OR hostname != ?)",
            )
            .bind(hostname)
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
///
/// All database mutations (device upserts, state changes, alerts, offline detection)
/// are wrapped in a single SQLite transaction for:
/// 1. **Atomicity** — if the process is killed mid-scan, the DB won't be left in an
///    inconsistent state (transaction is rolled back automatically on drop).
/// 2. **Performance** — batching ~10 queries per device into one transaction avoids
///    per-statement fsync overhead, yielding ~10x speedup on large subnets.
///
/// Reverse DNS lookups (best-effort hostname enrichment) run *after* the transaction
/// commits, outside the transaction boundary, since they are non-critical and involve
/// network I/O that would hold the transaction open unnecessarily.
pub async fn process_scan_results(
    db: &SqlitePool,
    discovered: &[DiscoveredDevice],
    offline_grace_secs: u64,
    ws_hub: &WsHub,
) -> Result<ScanSummary> {
    let now = Utc::now().to_rfc3339();

    // Scan summary counters.
    let mut new_device_count: u32 = 0;
    let mut updated_device_count: u32 = 0;

    // Pairs of (device_id, ip) collected during upsert for batch DNS resolution.
    let mut dns_targets: Vec<(String, String)> = Vec::new();

    // Enrichment targets: (device_id, ip, mac, hostname, vendor, mdns_services)
    let mut enrichment_targets: Vec<EnrichmentTarget> = Vec::new();

    // Begin a single transaction for all DB mutations (Phase 1 + Phase 2).
    let mut tx = db.begin().await?;

    // --- Phase 1: Upsert discovered devices ---
    for dev in discovered {
        let mac_normalized = dev.mac.to_lowercase();

        // Check if device already exists.
        let existing: Option<(String, bool)> =
            sqlx::query("SELECT id, is_online FROM devices WHERE mac = ?")
                .bind(&mac_normalized)
                .fetch_optional(&mut *tx)
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
                .execute(&mut *tx)
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
                .execute(&mut *tx)
                .await?;

                // State change: was offline → now online.
                updated_device_count += 1;

                if !was_online {
                    // Log state change.
                    sqlx::query(
                        "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'online', ?)",
                    )
                    .bind(&device_id)
                    .bind(&now)
                    .execute(&mut *tx)
                    .await?;

                    // Record event in device_events history.
                    sqlx::query(
                        r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'online', ?)"#,
                    )
                    .bind(&device_id)
                    .bind(&now)
                    .execute(&mut *tx)
                    .await?;

                    // Create alert (skip if device is muted or duplicate).
                    if !is_device_muted(&mut *tx, &device_id).await
                        && !recent_alert_exists(&mut *tx, &device_id, "device_online", 600).await
                    {
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
                        .execute(&mut *tx)
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
                new_device_count += 1;
                let device_id = uuid::Uuid::new_v4().to_string();
                let mac_is_randomized = crate::enrichment::is_randomized_mac(&mac_normalized);
                let vendor = if mac_is_randomized {
                    None // Don't look up OUI for randomized MACs
                } else {
                    crate::oui::lookup(&mac_normalized).map(|v| v.to_string())
                };

                sqlx::query(
                    "INSERT INTO devices (id, mac, vendor, is_randomized_mac, first_seen_at, last_seen_at, is_online) \
                     VALUES (?, ?, ?, ?, ?, ?, 1)",
                )
                .bind(&device_id)
                .bind(&mac_normalized)
                .bind(&vendor)
                .bind(mac_is_randomized as i32)
                .bind(&now)
                .bind(&now)
                .execute(&mut *tx)
                .await?;

                // Insert IP mapping.
                sqlx::query(
                    "INSERT INTO device_ips (device_id, ip, seen_at, is_current) VALUES (?, ?, ?, 1)",
                )
                .bind(&device_id)
                .bind(&dev.ip)
                .bind(&now)
                .execute(&mut *tx)
                .await?;

                // Log initial online state.
                sqlx::query(
                    "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'online', ?)",
                )
                .bind(&device_id)
                .bind(&now)
                .execute(&mut *tx)
                .await?;

                // Record initial online event in device_events history.
                sqlx::query(
                    r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'online', ?)"#,
                )
                .bind(&device_id)
                .bind(&now)
                .execute(&mut *tx)
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
                .execute(&mut *tx)
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

        dns_targets.push((device_id.clone(), dev.ip.clone()));

        // Collect enrichment target: (device_id, ip, mac, hostname, vendor, mdns_services)
        let hostname: Option<String> =
            sqlx::query_scalar("SELECT hostname FROM devices WHERE id = ?")
                .bind(&device_id)
                .fetch_optional(&mut *tx)
                .await?
                .flatten();
        let vendor: Option<String> = sqlx::query_scalar("SELECT vendor FROM devices WHERE id = ?")
            .bind(&device_id)
            .fetch_optional(&mut *tx)
            .await?
            .flatten();
        let mdns_svcs: Option<String> =
            sqlx::query_scalar("SELECT mdns_services FROM devices WHERE id = ?")
                .bind(&device_id)
                .fetch_optional(&mut *tx)
                .await?
                .flatten();

        enrichment_targets.push((
            device_id,
            dev.ip.clone(),
            dev.mac.to_lowercase(),
            hostname,
            vendor,
            mdns_svcs,
        ));
    }

    // --- Phase 2: Mark stale devices as offline ---
    // Devices that are currently online but haven't been seen within the grace period.
    // This runs inside the same transaction so it sees Phase 1's updates.
    let grace_cutoff =
        (Utc::now() - chrono::Duration::seconds(offline_grace_secs as i64)).to_rfc3339();

    let stale_devices: Vec<(String, String)> =
        sqlx::query("SELECT id, mac FROM devices WHERE is_online = 1 AND last_seen_at < ?")
            .bind(&grace_cutoff)
            .fetch_all(&mut *tx)
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
            .execute(&mut *tx)
            .await?;

        // Mark all IPs as not current.
        sqlx::query("UPDATE device_ips SET is_current = 0 WHERE device_id = ?")
            .bind(device_id)
            .execute(&mut *tx)
            .await?;

        // Log state change.
        sqlx::query(
            "INSERT INTO device_state_log (device_id, state, changed_at) VALUES (?, 'offline', ?)",
        )
        .bind(device_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        // Record offline event in device_events history.
        sqlx::query(
            r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, 'offline', ?)"#,
        )
        .bind(device_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        // Create alert (skip if device is muted or duplicate).
        if !is_device_muted(&mut *tx, device_id).await
            && !recent_alert_exists(&mut *tx, device_id, "device_offline", 600).await
        {
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
            .execute(&mut *tx)
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

    // Commit the transaction — all Phase 1 + Phase 2 mutations are now durable.
    // If any error occurred above, tx is dropped and all changes are rolled back.
    tx.commit().await?;

    // --- Phase 3: Batch reverse DNS lookups with bounded concurrency ---
    // Runs after the transaction commits because DNS involves network I/O and
    // would hold the write lock open unnecessarily. Hostname updates are
    // best-effort enrichment — not critical for data consistency.
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

    // --- Phase 3.5: External device identification (MikroTik DHCP, Xiaomi) ---
    // Query configured routers for DHCP hostnames and device names.
    // This fills in hostnames for devices with randomized MACs that reverse DNS
    // cannot resolve. Runs after DNS so it only targets devices still missing hostnames.
    {
        let device_macs: Vec<(String, String)> = enrichment_targets
            .iter()
            .map(|(id, _ip, mac, _hostname, _vendor, _mdns)| (id.clone(), mac.clone()))
            .collect();
        device_identify::identify_from_external_sources(db, &device_macs).await;
    }

    // Re-read hostnames for enrichment targets after external identification,
    // so the enrichment engine can use newly discovered hostnames.
    for target in enrichment_targets.iter_mut() {
        let fresh_hostname: Option<String> =
            sqlx::query_scalar("SELECT hostname FROM devices WHERE id = ?")
                .bind(&target.0)
                .fetch_optional(db)
                .await
                .ok()
                .flatten()
                .flatten();
        if fresh_hostname.is_some() {
            target.3 = fresh_hostname;
        }
    }

    // --- Phase 4: Device enrichment (OS, type, model) ---
    // Runs after DNS so hostnames are available for enrichment heuristics.
    for (device_id, ip, mac, hostname, vendor, mdns_services) in &enrichment_targets {
        crate::enrichment::enrich_device(
            db,
            device_id,
            ip,
            mac,
            hostname.as_deref(),
            vendor.as_deref(),
            mdns_services.as_deref(),
            None, // TTL not available from ARP scan
        )
        .await;
    }

    // --- Phase 5: Additional scanner sources (best-effort) ---
    let all_ips: Vec<String> = enrichment_targets.iter().map(|t| t.1.clone()).collect();
    let mut sources = vec!["arp".to_string(), "reverse_dns".to_string()];

    // Read per-source settings from DB (default: disabled for heavy scans).
    let nmap_enabled = read_bool_setting(db, "nmap_scan_enabled").await;
    let netbios_enabled = read_bool_setting(db, "netbios_scan_enabled").await;
    let snmp_enabled = read_bool_setting(db, "snmp_scan_enabled").await;
    let http_fp_enabled = read_bool_setting(db, "http_fingerprint_enabled").await;

    // Phase 5a: nmap scan (OS fingerprinting, open ports, service banners)
    if nmap_enabled {
        sources.push("nmap".to_string());
        let nmap_results = nmap::scan_hosts(&all_ips).await;
        for nr in &nmap_results {
            if let Some(target) = enrichment_targets.iter().find(|t| t.1 == nr.ip) {
                let device_id = &target.0;
                // Store OS hint from nmap
                if let Some(ref os) = nr.os_hint {
                    let _ = sqlx::query(
                        "UPDATE devices SET os_family = COALESCE(os_family, ?), enrichment_source = COALESCE(enrichment_source, 'nmap'), updated_at = ? WHERE id = ? AND enrichment_corrected IS NOT 1",
                    )
                    .bind(os)
                    .bind(&now)
                    .bind(device_id)
                    .execute(db)
                    .await;
                }
                // Store open ports as JSON in port_scans table
                if !nr.open_ports.is_empty() {
                    let ports_json: Vec<serde_json::Value> = nr
                        .open_ports
                        .iter()
                        .map(|p| {
                            json!({
                                "port": p.port,
                                "protocol": p.protocol,
                                "state": "open",
                                "service": p.service,
                                "version": p.version,
                            })
                        })
                        .collect();
                    let result_json =
                        serde_json::to_string(&ports_json).unwrap_or_else(|_| "[]".to_string());
                    let _ = sqlx::query(
                        "INSERT INTO port_scans (device_id, result_json) VALUES (?, ?)",
                    )
                    .bind(device_id)
                    .bind(&result_json)
                    .execute(db)
                    .await;
                }
            }
        }
    }

    // Phase 5b: NetBIOS lookups (Windows machine names)
    if netbios_enabled {
        sources.push("netbios".to_string());
        let netbios_results = netbios::lookup_hosts(&all_ips).await;
        for nb in &netbios_results {
            if let Some(ref name) = nb.name {
                if let Some(target) = enrichment_targets.iter().find(|t| t.1 == nb.ip) {
                    let device_id = &target.0;
                    let _ = sqlx::query(
                        "UPDATE devices SET hostname = COALESCE(hostname, ?), name = COALESCE(name, ?), os_family = COALESCE(os_family, 'Windows'), enrichment_source = COALESCE(enrichment_source, 'netbios'), updated_at = ? WHERE id = ?",
                    )
                    .bind(name)
                    .bind(name)
                    .bind(&now)
                    .bind(device_id)
                    .execute(db)
                    .await;
                }
            }
        }
    }

    // Phase 5c: SNMP discovery (managed switches/routers)
    if snmp_enabled {
        sources.push("snmp".to_string());
        let snmp_results = snmp::query_hosts(&all_ips).await;
        for sr in &snmp_results {
            if sr.sys_name.is_some() || sr.sys_descr.is_some() {
                if let Some(target) = enrichment_targets.iter().find(|t| t.1 == sr.ip) {
                    let device_id = &target.0;
                    if let Some(ref name) = sr.sys_name {
                        let _ = sqlx::query(
                            "UPDATE devices SET hostname = COALESCE(hostname, ?), name = COALESCE(name, ?), enrichment_source = COALESCE(enrichment_source, 'snmp'), updated_at = ? WHERE id = ?",
                        )
                        .bind(name)
                        .bind(name)
                        .bind(&now)
                        .bind(device_id)
                        .execute(db)
                        .await;
                    }
                    if let Some(ref descr) = sr.sys_descr {
                        // Try to infer device type from sysDescr
                        let device_type = if descr.to_lowercase().contains("router") {
                            Some("router")
                        } else if descr.to_lowercase().contains("switch") {
                            Some("switch")
                        } else {
                            None
                        };
                        if let Some(dt) = device_type {
                            let _ = sqlx::query(
                                "UPDATE devices SET device_type = COALESCE(device_type, ?), updated_at = ? WHERE id = ? AND enrichment_corrected IS NOT 1",
                            )
                            .bind(dt)
                            .bind(&now)
                            .bind(device_id)
                            .execute(db)
                            .await;
                        }
                    }
                }
            }
        }
    }

    // Phase 5d: HTTP fingerprinting (device model from Server header)
    if http_fp_enabled {
        sources.push("http_fingerprint".to_string());
        let http_results = http_fingerprint::probe_hosts(&all_ips).await;
        for hr in &http_results {
            if let Some(ref server) = hr.server_header {
                if let Some(target) = enrichment_targets.iter().find(|t| t.1 == hr.ip) {
                    let device_id = &target.0;
                    if let Some(device_type) = http_fingerprint::infer_device_from_server(server) {
                        let _ = sqlx::query(
                            "UPDATE devices SET device_type = COALESCE(device_type, ?), device_model = COALESCE(device_model, ?), enrichment_source = COALESCE(enrichment_source, 'http'), updated_at = ? WHERE id = ? AND enrichment_corrected IS NOT 1",
                        )
                        .bind(device_type)
                        .bind(server)
                        .bind(&now)
                        .bind(device_id)
                        .execute(db)
                        .await;
                    }
                }
            }
        }
    }

    // Broadcast scan complete event with summary.
    let offline_count = stale_devices.len() as u32;
    let summary = ScanSummary {
        new_devices: new_device_count,
        updated_devices: updated_device_count,
        offline_devices: offline_count,
        total_scanned: discovered.len() as u32,
        sources,
    };

    ws_hub.broadcast(
        "scan_complete",
        json!({
            "new_devices": summary.new_devices,
            "updated_devices": summary.updated_devices,
            "offline_devices": summary.offline_devices,
            "total_scanned": summary.total_scanned,
            "sources": summary.sources,
        }),
    );

    Ok(summary)
}

/// Helper to read a boolean setting from the DB settings table.
async fn read_bool_setting(db: &SqlitePool, key: &str) -> bool {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create an in-memory SQLite pool with all migrations applied.
    async fn test_pool() -> SqlitePool {
        crate::db::init(":memory:").await.expect("DB init failed")
    }

    #[tokio::test]
    async fn test_scan_transaction_atomic() {
        // Verify that device upserts within a committed transaction are persisted.
        let pool = test_pool().await;

        let device_id = uuid::Uuid::new_v4().to_string();
        let mac = "aa:bb:cc:dd:ee:01";
        let now = Utc::now().to_rfc3339();

        // Insert inside a transaction, then commit.
        let mut tx = pool.begin().await.expect("begin tx");

        sqlx::query(
            "INSERT INTO devices (id, mac, first_seen_at, last_seen_at, is_online) VALUES (?, ?, ?, ?, 1)",
        )
        .bind(&device_id)
        .bind(mac)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .expect("insert device");

        // Visible within the transaction itself.
        let inside: Option<(String,)> = sqlx::query_as("SELECT id FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_optional(&mut *tx)
            .await
            .expect("query within tx");
        assert!(inside.is_some(), "Device should be visible inside tx");

        tx.commit().await.expect("commit tx");

        // After commit: device should be visible from pool.
        let after: Option<(String,)> = sqlx::query_as("SELECT id FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_optional(&pool)
            .await
            .expect("query pool after commit");
        assert!(after.is_some(), "Device MUST be visible after commit");
        assert_eq!(after.unwrap().0, device_id);
    }

    #[tokio::test]
    async fn test_scan_partial_rollback() {
        // Verify that dropping a transaction without commit rolls back all changes.
        let pool = test_pool().await;

        let mac = "aa:bb:cc:dd:ee:02";
        let now = Utc::now().to_rfc3339();

        {
            let mut tx = pool.begin().await.expect("begin tx");

            let device_id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO devices (id, mac, first_seen_at, last_seen_at, is_online) VALUES (?, ?, ?, ?, 1)",
            )
            .bind(&device_id)
            .bind(mac)
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await
            .expect("insert device in tx");

            // Verify it's visible within the transaction.
            let inside: Option<(String,)> = sqlx::query_as("SELECT id FROM devices WHERE mac = ?")
                .bind(mac)
                .fetch_optional(&mut *tx)
                .await
                .expect("query within tx");
            assert!(
                inside.is_some(),
                "Device should be visible inside the transaction"
            );

            // Drop tx without commit → automatic rollback.
            drop(tx);
        }

        // After rollback: device should NOT be in the database.
        let after: Option<(String,)> = sqlx::query_as("SELECT id FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_optional(&pool)
            .await
            .expect("query pool after rollback");
        assert!(
            after.is_none(),
            "Device must NOT be visible after transaction rollback"
        );
    }

    #[tokio::test]
    async fn test_process_scan_results_inserts_device() {
        // End-to-end test: process_scan_results should insert a new device
        // and it should be visible after the function returns.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        let devices = vec![DiscoveredDevice {
            ip: "10.0.0.1".to_string(),
            mac: "aa:bb:cc:dd:ee:03".to_string(),
        }];

        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("process_scan_results should succeed");

        // Verify device was inserted.
        let row: Option<(String, i32)> =
            sqlx::query_as("SELECT mac, is_online FROM devices WHERE mac = 'aa:bb:cc:dd:ee:03'")
                .fetch_optional(&pool)
                .await
                .expect("query device");
        assert!(row.is_some(), "Device should exist after processing");
        let (mac, is_online) = row.unwrap();
        assert_eq!(mac, "aa:bb:cc:dd:ee:03");
        assert_eq!(is_online, 1, "Device should be online");

        // Verify device_ips entry.
        let ip_row: Option<(String,)> = sqlx::query_as(
            "SELECT ip FROM device_ips WHERE device_id = (SELECT id FROM devices WHERE mac = 'aa:bb:cc:dd:ee:03')",
        )
        .fetch_optional(&pool)
        .await
        .expect("query device_ips");
        assert!(ip_row.is_some(), "device_ips entry should exist");
        assert_eq!(ip_row.unwrap().0, "10.0.0.1");

        // Verify an alert was created.
        let alert_row: Option<(String,)> = sqlx::query_as(
            "SELECT type FROM alerts WHERE device_id = (SELECT id FROM devices WHERE mac = 'aa:bb:cc:dd:ee:03')",
        )
        .fetch_optional(&pool)
        .await
        .expect("query alerts");
        assert!(
            alert_row.is_some(),
            "Alert should be created for new device"
        );
        assert_eq!(alert_row.unwrap().0, "new_device");
    }

    #[tokio::test]
    async fn test_process_scan_results_state_transitions() {
        // Test the full lifecycle: new → offline → back online.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());
        let mac = "aa:bb:cc:dd:ee:04";

        // Step 1: Discover device.
        let devices = vec![DiscoveredDevice {
            ip: "10.0.0.2".to_string(),
            mac: mac.to_string(),
        }];
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("initial scan");

        // Step 2: Force the device to look stale by backdating last_seen_at.
        sqlx::query("UPDATE devices SET last_seen_at = datetime('now', '-1 hour') WHERE mac = ?")
            .bind(mac)
            .execute(&pool)
            .await
            .expect("backdate last_seen_at");

        // Run scan with no devices (empty) → should mark device offline.
        process_scan_results(&pool, &[], 60, &ws_hub)
            .await
            .expect("empty scan");

        let is_online: i32 = sqlx::query_scalar("SELECT is_online FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_one(&pool)
            .await
            .expect("query is_online");
        assert_eq!(is_online, 0, "Device should be offline after grace period");

        // Step 3: Device reappears.
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("re-discovery scan");

        let is_online: i32 = sqlx::query_scalar("SELECT is_online FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_one(&pool)
            .await
            .expect("query is_online after re-discovery");
        assert_eq!(is_online, 1, "Device should be back online");

        // Verify state log entries: online → offline → online.
        let states: Vec<String> = sqlx::query_scalar(
            r#"SELECT state FROM device_state_log
               WHERE device_id = (SELECT id FROM devices WHERE mac = ?)
               ORDER BY changed_at"#,
        )
        .bind(mac)
        .fetch_all(&pool)
        .await
        .expect("query state log");
        assert_eq!(states, vec!["online", "offline", "online"]);
    }

    // ---------------------------------------------------------------
    // Integration tests for device discovery pipeline
    // ---------------------------------------------------------------

    /// ARP output fixture simulating a realistic network scan with multiple
    /// devices across a subnet, including incomplete entries that should be
    /// skipped.
    const ARP_FIXTURE: &str = "\
? (10.10.0.1) at bc:24:11:d6:6b:01 [ether] on eth0
? (10.10.0.2) at bc:24:11:d6:6b:02 [ether] on eth0
? (10.10.0.3) at bc:24:11:d6:6b:03 [ether] on eth0
? (10.10.0.10) at 60:be:b4:28:ec:64 [ether] on eth0
? (10.10.0.25) at <incomplete> on eth0
? (10.10.0.50) at aa:bb:cc:dd:ee:ff [ether] on wlan0
? (10.10.0.99) at <incomplete> on eth0";

    #[tokio::test]
    async fn test_full_scan_cycle_with_arp_fixture() {
        // Integration test: simulate a full scan cycle by parsing a realistic
        // ARP output fixture and processing the results through the pipeline.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        // Phase 0 substitute: parse ARP fixture instead of reading /proc/net/arp.
        let discovered = arp::parse_arp_output(ARP_FIXTURE);
        assert_eq!(
            discovered.len(),
            5,
            "Fixture should yield 5 devices (2 incomplete entries skipped)"
        );

        // Phase 1–2: process scan results (upsert devices, detect state changes).
        process_scan_results(&pool, &discovered, 300, &ws_hub)
            .await
            .expect("process_scan_results should succeed");

        // Verify all 5 devices were inserted and are online.
        let device_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
                .fetch_one(&pool)
                .await
                .expect("count devices");
        assert_eq!(device_count, 5, "All 5 discovered devices should be online");

        // Verify each device has a device_ips entry.
        let ip_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM device_ips WHERE is_current = 1")
                .fetch_one(&pool)
                .await
                .expect("count device_ips");
        assert_eq!(ip_count, 5, "Each device should have a current IP mapping");

        // Verify specific device data from the fixture.
        let router: Option<(String, String, i32)> = sqlx::query_as(
            "SELECT d.mac, di.ip, d.is_online FROM devices d JOIN device_ips di ON d.id = di.device_id WHERE d.mac = 'bc:24:11:d6:6b:01'",
        )
        .fetch_optional(&pool)
        .await
        .expect("query router device");
        assert!(router.is_some(), "Router device should exist");
        let (mac, ip, online) = router.unwrap();
        assert_eq!(mac, "bc:24:11:d6:6b:01");
        assert_eq!(ip, "10.10.0.1");
        assert_eq!(online, 1);

        // Verify state log was created for each device (initial online state).
        let state_log_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM device_state_log WHERE state = 'online'")
                .fetch_one(&pool)
                .await
                .expect("count state_log");
        assert_eq!(
            state_log_count, 5,
            "Each device should have an initial online state log entry"
        );

        // Verify device_events were recorded for each device.
        let event_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM device_events WHERE event_type = 'online'")
                .fetch_one(&pool)
                .await
                .expect("count device_events");
        assert_eq!(
            event_count, 5,
            "Each device should have an initial online event"
        );
    }

    #[tokio::test]
    async fn test_device_deduplication_across_scans() {
        // Integration test: running multiple scans with the same devices should
        // not create duplicate entries — devices are identified by MAC address.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        let devices = vec![
            DiscoveredDevice {
                ip: "10.0.0.1".to_string(),
                mac: "aa:bb:cc:00:11:22".to_string(),
            },
            DiscoveredDevice {
                ip: "10.0.0.2".to_string(),
                mac: "aa:bb:cc:00:11:33".to_string(),
            },
        ];

        // Run the same scan 3 times.
        for i in 0..3 {
            process_scan_results(&pool, &devices, 300, &ws_hub)
                .await
                .unwrap_or_else(|e| panic!("scan {i} failed: {e}"));
        }

        // Only 2 device rows should exist (no duplicates).
        let device_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
            .fetch_one(&pool)
            .await
            .expect("count devices");
        assert_eq!(
            device_count, 2,
            "Repeated scans must not create duplicate devices"
        );

        // Only 1 new_device alert per device (deduplication).
        let alert_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'new_device'")
                .fetch_one(&pool)
                .await
                .expect("count new_device alerts");
        assert_eq!(
            alert_count, 2,
            "Only the first scan should create new_device alerts"
        );

        // Verify last_seen_at was updated (not first_seen_at).
        let row: (String, String) = sqlx::query_as(
            "SELECT first_seen_at, last_seen_at FROM devices WHERE mac = 'aa:bb:cc:00:11:22'",
        )
        .fetch_one(&pool)
        .await
        .expect("query timestamps");
        let (first_seen, last_seen) = row;
        // last_seen_at should be >= first_seen_at (updated by later scans).
        assert!(
            last_seen >= first_seen,
            "last_seen_at should be updated on subsequent scans"
        );
    }

    #[tokio::test]
    async fn test_device_deduplication_ip_change() {
        // Integration test: a device changing IP between scans should update
        // its IP mapping without creating a new device.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());
        let mac = "aa:bb:cc:00:22:33";

        // Scan 1: device at IP 10.0.0.50.
        let scan1 = vec![DiscoveredDevice {
            ip: "10.0.0.50".to_string(),
            mac: mac.to_string(),
        }];
        process_scan_results(&pool, &scan1, 300, &ws_hub)
            .await
            .expect("scan 1");

        // Scan 2: same device at a different IP.
        let scan2 = vec![DiscoveredDevice {
            ip: "10.0.0.60".to_string(),
            mac: mac.to_string(),
        }];
        process_scan_results(&pool, &scan2, 300, &ws_hub)
            .await
            .expect("scan 2");

        // Still only 1 device.
        let device_count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
            .fetch_one(&pool)
            .await
            .expect("count devices");
        assert_eq!(device_count, 1, "IP change must not create a new device");

        // Both IPs should be recorded in device_ips.
        let ip_count: i32 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM device_ips WHERE device_id = (SELECT id FROM devices WHERE mac = ?)",
        )
        .bind(mac)
        .fetch_one(&pool)
        .await
        .expect("count IPs");
        assert_eq!(ip_count, 2, "Both IPs should be tracked in device_ips");

        // The new IP should be marked as current.
        let current_ip: String = sqlx::query_scalar(
            "SELECT ip FROM device_ips WHERE device_id = (SELECT id FROM devices WHERE mac = ?) AND is_current = 1 ORDER BY seen_at DESC LIMIT 1",
        )
        .bind(mac)
        .fetch_one(&pool)
        .await
        .expect("query current IP");
        assert_eq!(current_ip, "10.0.0.60", "Latest IP should be current");
    }

    #[tokio::test]
    async fn test_new_device_detection_triggers_notification() {
        // Integration test: discovering new devices should create alerts with
        // correct type, severity, and message content.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        // Discover 3 new devices in a single scan.
        let devices = vec![
            DiscoveredDevice {
                ip: "10.0.0.1".to_string(),
                mac: "aa:bb:cc:11:22:01".to_string(),
            },
            DiscoveredDevice {
                ip: "10.0.0.2".to_string(),
                mac: "aa:bb:cc:11:22:02".to_string(),
            },
            DiscoveredDevice {
                ip: "10.0.0.3".to_string(),
                mac: "aa:bb:cc:11:22:03".to_string(),
            },
        ];

        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("process_scan_results");

        // Verify 3 new_device alerts were created (one per device).
        let alerts: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT a.type, a.severity, a.message, a.device_id FROM alerts a WHERE a.type = 'new_device' ORDER BY a.created_at",
        )
        .fetch_all(&pool)
        .await
        .expect("query alerts");
        assert_eq!(alerts.len(), 3, "Each new device should trigger an alert");

        for (alert_type, severity, message, device_id) in &alerts {
            assert_eq!(alert_type, "new_device");
            assert_eq!(severity, severity_for_alert_type("new_device"));
            assert!(
                message.contains("New device discovered"),
                "Alert message should describe the discovery: {message}"
            );
            assert!(
                !device_id.is_empty(),
                "Alert must reference the discovered device"
            );
        }

        // Verify the alerts have detail JSON with MAC and IP.
        let detail_rows: Vec<(String,)> = sqlx::query_as(
            "SELECT details FROM alerts WHERE type = 'new_device' AND details IS NOT NULL",
        )
        .fetch_all(&pool)
        .await
        .expect("query alert details");
        assert_eq!(
            detail_rows.len(),
            3,
            "Each new_device alert should have details JSON"
        );
        for (details,) in &detail_rows {
            let parsed: serde_json::Value =
                serde_json::from_str(details).expect("details should be valid JSON");
            assert!(parsed.get("mac").is_some(), "Details should contain MAC");
            assert!(parsed.get("ip").is_some(), "Details should contain IP");
        }
    }

    #[tokio::test]
    async fn test_new_device_alert_not_created_when_muted() {
        // Integration test: a muted device coming back online should not
        // generate a device_online alert.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());
        let mac = "aa:bb:cc:33:44:55";

        // Step 1: Discover the device.
        let devices = vec![DiscoveredDevice {
            ip: "10.0.0.5".to_string(),
            mac: mac.to_string(),
        }];
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("initial scan");

        // Step 2: Mute the device.
        sqlx::query("UPDATE devices SET muted_until = datetime('now', '+1 hour') WHERE mac = ?")
            .bind(mac)
            .execute(&pool)
            .await
            .expect("mute device");

        // Step 3: Force offline.
        sqlx::query("UPDATE devices SET last_seen_at = datetime('now', '-1 hour'), is_online = 0 WHERE mac = ?")
            .bind(mac)
            .execute(&pool)
            .await
            .expect("force offline");

        // Clear existing alerts to isolate the test.
        sqlx::query("DELETE FROM alerts")
            .execute(&pool)
            .await
            .expect("clear alerts");

        // Step 4: Device reappears — should not create device_online alert (muted).
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("re-discovery scan");

        let alert_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'device_online'")
                .fetch_one(&pool)
                .await
                .expect("count device_online alerts");
        assert_eq!(
            alert_count, 0,
            "Muted device should not generate device_online alert"
        );
    }

    #[tokio::test]
    async fn test_stale_device_removal_after_missed_scans() {
        // Integration test: devices that have not been seen for longer than the
        // offline grace period should be marked offline with proper state
        // tracking and alerts.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        // Step 1: Discover 3 devices.
        let all_devices = vec![
            DiscoveredDevice {
                ip: "10.0.0.10".to_string(),
                mac: "aa:bb:cc:44:55:01".to_string(),
            },
            DiscoveredDevice {
                ip: "10.0.0.11".to_string(),
                mac: "aa:bb:cc:44:55:02".to_string(),
            },
            DiscoveredDevice {
                ip: "10.0.0.12".to_string(),
                mac: "aa:bb:cc:44:55:03".to_string(),
            },
        ];
        process_scan_results(&pool, &all_devices, 300, &ws_hub)
            .await
            .expect("initial scan");

        let online_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
                .fetch_one(&pool)
                .await
                .expect("count online");
        assert_eq!(online_count, 3, "All 3 devices should be online");

        // Step 2: Backdate 2 devices to simulate them missing several scans.
        sqlx::query(
            "UPDATE devices SET last_seen_at = datetime('now', '-1 hour') WHERE mac IN ('aa:bb:cc:44:55:01', 'aa:bb:cc:44:55:02')",
        )
        .execute(&pool)
        .await
        .expect("backdate stale devices");

        // Step 3: Run scan with only the 3rd device present.
        let remaining = vec![DiscoveredDevice {
            ip: "10.0.0.12".to_string(),
            mac: "aa:bb:cc:44:55:03".to_string(),
        }];
        process_scan_results(&pool, &remaining, 60, &ws_hub)
            .await
            .expect("scan with missing devices");

        // Step 4: Verify 2 devices went offline, 1 remains online.
        let online_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
                .fetch_one(&pool)
                .await
                .expect("count online after stale removal");
        assert_eq!(online_count, 1, "Only 1 device should remain online");

        let offline_count: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 0")
                .fetch_one(&pool)
                .await
                .expect("count offline");
        assert_eq!(offline_count, 2, "2 devices should be offline");

        // The surviving device should be the one still being scanned.
        let surviving: String = sqlx::query_scalar("SELECT mac FROM devices WHERE is_online = 1")
            .fetch_one(&pool)
            .await
            .expect("query surviving device");
        assert_eq!(surviving, "aa:bb:cc:44:55:03");

        // Verify device_offline alerts were created for the stale devices.
        let offline_alerts: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'device_offline'")
                .fetch_one(&pool)
                .await
                .expect("count device_offline alerts");
        assert_eq!(
            offline_alerts, 2,
            "Each stale device should have a device_offline alert"
        );

        // Verify state log records: each stale device should have online → offline.
        for mac in &["aa:bb:cc:44:55:01", "aa:bb:cc:44:55:02"] {
            let states: Vec<String> = sqlx::query_scalar(
                "SELECT state FROM device_state_log WHERE device_id = (SELECT id FROM devices WHERE mac = ?) ORDER BY changed_at",
            )
            .bind(mac)
            .fetch_all(&pool)
            .await
            .expect("query state log for stale device");
            assert_eq!(
                states,
                vec!["online", "offline"],
                "Stale device {mac} should transition from online to offline"
            );
        }

        // Verify IPs were marked as not current for offline devices.
        let stale_current_ips: i32 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM device_ips WHERE is_current = 1 AND device_id IN (SELECT id FROM devices WHERE is_online = 0)",
        )
        .fetch_one(&pool)
        .await
        .expect("count current IPs for offline devices");
        assert_eq!(
            stale_current_ips, 0,
            "Offline devices should have no current IP mappings"
        );
    }

    #[tokio::test]
    async fn test_stale_device_comes_back_online() {
        // Integration test: a device that went offline due to missed scans
        // should come back online when rediscovered, with proper alerts and
        // state transitions.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());
        let mac = "aa:bb:cc:55:66:77";

        // Step 1: Discover device.
        let devices = vec![DiscoveredDevice {
            ip: "10.0.0.20".to_string(),
            mac: mac.to_string(),
        }];
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("initial scan");

        // Step 2: Device goes stale → offline.
        sqlx::query("UPDATE devices SET last_seen_at = datetime('now', '-1 hour') WHERE mac = ?")
            .bind(mac)
            .execute(&pool)
            .await
            .expect("backdate");
        process_scan_results(&pool, &[], 60, &ws_hub)
            .await
            .expect("offline scan");

        let is_online: i32 = sqlx::query_scalar("SELECT is_online FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_one(&pool)
            .await
            .expect("check offline");
        assert_eq!(is_online, 0);

        // Step 3: Device reappears.
        process_scan_results(&pool, &devices, 300, &ws_hub)
            .await
            .expect("re-discovery scan");

        let is_online: i32 = sqlx::query_scalar("SELECT is_online FROM devices WHERE mac = ?")
            .bind(mac)
            .fetch_one(&pool)
            .await
            .expect("check back online");
        assert_eq!(is_online, 1, "Device should be back online");

        // Verify full state transition log: online → offline → online.
        let states: Vec<String> = sqlx::query_scalar(
            "SELECT state FROM device_state_log WHERE device_id = (SELECT id FROM devices WHERE mac = ?) ORDER BY changed_at",
        )
        .bind(mac)
        .fetch_all(&pool)
        .await
        .expect("query state log");
        assert_eq!(states, vec!["online", "offline", "online"]);

        // Verify device_events trail matches state log.
        let events: Vec<String> = sqlx::query_scalar(
            "SELECT event_type FROM device_events WHERE device_id = (SELECT id FROM devices WHERE mac = ?) ORDER BY occurred_at",
        )
        .bind(mac)
        .fetch_all(&pool)
        .await
        .expect("query events");
        assert_eq!(events, vec!["online", "offline", "online"]);

        // Verify a device_online alert was created for the re-discovery.
        let online_alert_count: i32 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM alerts WHERE type = 'device_online' AND device_id = (SELECT id FROM devices WHERE mac = ?)",
        )
        .bind(mac)
        .fetch_one(&pool)
        .await
        .expect("count device_online alerts");
        assert_eq!(
            online_alert_count, 1,
            "Re-discovered device should have a device_online alert"
        );
    }

    #[tokio::test]
    async fn test_full_scan_cycle_arp_fixture_to_pipeline() {
        // Integration test: end-to-end from ARP text parsing through the full
        // discovery pipeline, verifying the complete data flow.
        let pool = test_pool().await;
        let ws_hub = Arc::new(WsHub::new());

        // Parse the ARP fixture (simulates what scan_subnets would return).
        let scan1_devices = arp::parse_arp_output(ARP_FIXTURE);

        // Scan 1: initial discovery.
        process_scan_results(&pool, &scan1_devices, 300, &ws_hub)
            .await
            .expect("scan 1");

        // Scan 2: same devices (deduplication check).
        process_scan_results(&pool, &scan1_devices, 300, &ws_hub)
            .await
            .expect("scan 2");

        // Still only 5 unique devices.
        let count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count, 5, "Deduplication should prevent duplicate devices");

        // Scan 3: 2 devices disappear (simulate network change).
        let scan3_arp = "\
? (10.10.0.1) at bc:24:11:d6:6b:01 [ether] on eth0
? (10.10.0.50) at aa:bb:cc:dd:ee:ff [ether] on wlan0";
        let scan3_devices = arp::parse_arp_output(scan3_arp);
        assert_eq!(scan3_devices.len(), 2);

        // Backdate the 3 devices that will "disappear" so they exceed grace period.
        sqlx::query(
            "UPDATE devices SET last_seen_at = datetime('now', '-1 hour') WHERE mac IN ('bc:24:11:d6:6b:02', 'bc:24:11:d6:6b:03', '60:be:b4:28:ec:64')",
        )
        .execute(&pool)
        .await
        .expect("backdate missing devices");

        process_scan_results(&pool, &scan3_devices, 60, &ws_hub)
            .await
            .expect("scan 3 - partial network");

        // 2 online, 3 offline.
        let online: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
            .fetch_one(&pool)
            .await
            .expect("count online");
        assert_eq!(online, 2, "2 devices should remain online");

        let offline: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 0")
            .fetch_one(&pool)
            .await
            .expect("count offline");
        assert_eq!(offline, 3, "3 devices should be offline");

        // Scan 4: one offline device returns.
        let scan4_arp = "\
? (10.10.0.1) at bc:24:11:d6:6b:01 [ether] on eth0
? (10.10.0.10) at 60:be:b4:28:ec:64 [ether] on eth0
? (10.10.0.50) at aa:bb:cc:dd:ee:ff [ether] on wlan0";
        let scan4_devices = arp::parse_arp_output(scan4_arp);

        process_scan_results(&pool, &scan4_devices, 300, &ws_hub)
            .await
            .expect("scan 4 - device returns");

        let online: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE is_online = 1")
            .fetch_one(&pool)
            .await
            .expect("count online after return");
        assert_eq!(
            online, 3,
            "3 devices should be online (2 stayed + 1 returned)"
        );

        // Verify the returning device has the full state log.
        let returning_states: Vec<String> = sqlx::query_scalar(
            "SELECT state FROM device_state_log WHERE device_id = (SELECT id FROM devices WHERE mac = '60:be:b4:28:ec:64') ORDER BY changed_at",
        )
        .fetch_all(&pool)
        .await
        .expect("state log for returning device");
        assert_eq!(
            returning_states,
            vec!["online", "offline", "online"],
            "Returning device should have full state lifecycle"
        );

        // Verify total alerts: 5 new_device + 3 device_offline + 1 device_online.
        let new_alerts: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'new_device'")
                .fetch_one(&pool)
                .await
                .expect("count new_device");
        assert_eq!(new_alerts, 5);

        let offline_alerts: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'device_offline'")
                .fetch_one(&pool)
                .await
                .expect("count device_offline");
        assert_eq!(
            offline_alerts, 3,
            "3 stale devices should have device_offline alerts"
        );

        let online_alerts: i32 =
            sqlx::query_scalar("SELECT COUNT(*) FROM alerts WHERE type = 'device_online'")
                .fetch_one(&pool)
                .await
                .expect("count device_online");
        assert!(
            online_alerts >= 1,
            "At least 1 device_online alert expected for returning device, got {online_alerts}"
        );
    }
}
