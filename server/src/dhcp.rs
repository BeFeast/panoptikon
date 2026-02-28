//! Device identification — resolves unknown devices via DHCP hostnames from
//! multiple sources: VyOS, MikroTik, and Xiaomi MiWiFi.
//!
//! Periodically queries all configured router APIs and updates devices that have
//! no hostname/name with the identifiers from their DHCP lease or device list.

use sqlx::SqlitePool;
use tracing::{debug, info, warn};

use crate::config::AppConfig;
use crate::mikrotik::client::MikrotikClient;
use crate::xiaomi::client::XiaomiClient;

/// DHCP lease entry as returned by the VyOS API proxy.
#[derive(Debug, serde::Deserialize)]
struct DhcpLease {
    _ip: String,
    mac: String,
    hostname: Option<String>,
}

/// Run a single DHCP hostname enrichment pass.
///
/// Fetches DHCP leases from the VyOS router and updates device hostnames
/// for devices that don't already have one.
pub async fn enrich_from_dhcp_leases(pool: &SqlitePool, config: &AppConfig) {
    let vyos_url = match config.vyos.url {
        Some(ref url) if !url.is_empty() => url.clone(),
        _ => return, // No VyOS configured
    };
    let api_key = match config.vyos.api_key {
        Some(ref key) if !key.is_empty() => key.clone(),
        _ => return,
    };

    // Fetch DHCP leases directly from VyOS API.
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(config.vyos.insecure_tls)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let response = client
        .post(format!("{}/retrieve", vyos_url))
        .multipart(
            reqwest::multipart::Form::new()
                .text(
                    "data",
                    serde_json::json!({"op": "showConfig", "path": []}).to_string(),
                )
                .text("key", api_key.clone()),
        )
        .send()
        .await;

    // Fall back: query the server's own DHCP leases endpoint if VyOS direct access fails.
    // Instead, we'll query our own database for device_ips + leases.
    // Actually, the simplest approach: query VyOS show dhcp server leases.
    let leases_result = client
        .post(format!("{}/show", vyos_url))
        .multipart(
            reqwest::multipart::Form::new()
                .text(
                    "data",
                    serde_json::json!({"op": "show", "path": ["dhcp", "server", "leases"]})
                        .to_string(),
                )
                .text("key", api_key),
        )
        .send()
        .await;

    // Ignore the showConfig response if it errors
    drop(response);

    let leases_text = match leases_result {
        Ok(resp) if resp.status().is_success() => match resp.text().await {
            Ok(t) => t,
            Err(e) => {
                debug!("DHCP enrichment: failed to read response body: {e}");
                return;
            }
        },
        Ok(resp) => {
            debug!("DHCP enrichment: VyOS returned status {}", resp.status());
            return;
        }
        Err(e) => {
            debug!("DHCP enrichment: VyOS request failed: {e}");
            return;
        }
    };

    // Parse VyOS DHCP lease output (text format).
    // VyOS returns text output, not JSON for show commands. Parse IP/MAC/hostname.
    let leases = parse_dhcp_leases(&leases_text);
    if leases.is_empty() {
        debug!("DHCP enrichment: no leases found");
        return;
    }

    let mut updated = 0u32;
    for lease in &leases {
        let hostname = match lease.hostname {
            Some(ref h) if !h.is_empty() && h != "*" => h,
            _ => continue,
        };

        let mac_normalized = lease.mac.to_lowercase();

        // Update hostname for devices that don't already have one.
        let result = sqlx::query(
            r#"UPDATE devices SET hostname = ?, updated_at = datetime('now')
               WHERE mac = ? AND (hostname IS NULL OR hostname = '')"#,
        )
        .bind(hostname)
        .bind(&mac_normalized)
        .execute(pool)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => {
                info!(mac = %mac_normalized, hostname = %hostname, "DHCP hostname set");
                updated += 1;
            }
            Ok(_) => {}
            Err(e) => {
                warn!(mac = %mac_normalized, error = %e, "Failed to set DHCP hostname");
            }
        }
    }

    if updated > 0 {
        info!(updated, "DHCP hostname enrichment complete");
    }
}

/// Parse VyOS DHCP lease text output into structured entries.
///
/// VyOS `show dhcp server leases` output format:
/// ```text
/// IP Address      MAC Address         Hostname     ...
/// ----------      -----------         --------     ...
/// 10.10.0.100     aa:bb:cc:dd:ee:ff   mydevice     ...
/// ```
fn parse_dhcp_leases(text: &str) -> Vec<DhcpLease> {
    let mut leases = Vec::new();

    // Try JSON parse first (some VyOS versions return JSON).
    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(text) {
        if let Some(data) = json_val.get("data").and_then(|d| d.as_object()) {
            for (_subnet, subnet_val) in data {
                if let Some(entries) = subnet_val.as_object() {
                    for (ip, entry) in entries {
                        let mac = entry
                            .get("mac")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let hostname = entry
                            .get("hostname")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        if !mac.is_empty() {
                            leases.push(DhcpLease {
                                _ip: ip.clone(),
                                mac,
                                hostname,
                            });
                        }
                    }
                }
            }
            return leases;
        }
    }

    // Fall back to text parsing.
    let mut in_data = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("---") || trimmed.starts_with("===") {
            in_data = true;
            continue;
        }
        if trimmed.starts_with("IP Address") || trimmed.starts_with("IP address") {
            continue;
        }
        if !in_data && !trimmed.is_empty() {
            // Check if line looks like data (starts with IP)
            if trimmed
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
            {
                in_data = true;
            } else {
                continue;
            }
        }

        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 3 {
            let ip = parts[0].to_string();
            let mac = parts[1].to_string();
            let hostname = if parts.len() > 2 && parts[2] != "*" {
                Some(parts[2].to_string())
            } else {
                None
            };

            // Basic IP validation
            if ip.parse::<std::net::IpAddr>().is_ok() && mac.contains(':') {
                leases.push(DhcpLease {
                    _ip: ip,
                    mac,
                    hostname,
                });
            }
        }
    }

    leases
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

/// Run a single MikroTik DHCP hostname enrichment pass.
///
/// Fetches DHCP leases from the MikroTik router and updates device hostnames
/// for devices that don't already have one.
pub async fn enrich_from_mikrotik_leases(pool: &SqlitePool) {
    let enabled = get_setting(pool, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return;
    }

    let url = match get_setting(pool, "mikrotik_url").await {
        Some(u) => u,
        None => return,
    };
    let user = get_setting(pool, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(pool, "mikrotik_password")
        .await
        .unwrap_or_default();

    let http = crate::mikrotik::client::shared_http_client();
    let client = MikrotikClient::with_http(&url, &user, &password, http);

    let leases = match client.dhcp_leases().await {
        Ok(l) => l,
        Err(e) => {
            debug!("MikroTik DHCP enrichment: failed to fetch leases: {e}");
            return;
        }
    };

    if leases.is_empty() {
        debug!("MikroTik DHCP enrichment: no leases found");
        return;
    }

    let mut updated = 0u32;
    for lease in &leases {
        let hostname = match lease.host_name {
            Some(ref h) if !h.is_empty() => h,
            _ => continue,
        };
        let mac = match lease.mac_address {
            Some(ref m) => m.to_lowercase(),
            None => continue,
        };

        // Update hostname for devices that don't already have one.
        let result = sqlx::query(
            r#"UPDATE devices SET hostname = ?, updated_at = datetime('now')
               WHERE mac = ? AND (hostname IS NULL OR hostname = '')"#,
        )
        .bind(hostname)
        .bind(&mac)
        .execute(pool)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => {
                info!(mac = %mac, hostname = %hostname, "MikroTik DHCP hostname set");
                updated += 1;

                // Also trigger enrichment with the new hostname
                trigger_enrichment_for_mac(pool, &mac).await;
            }
            Ok(_) => {}
            Err(e) => {
                warn!(mac = %mac, error = %e, "Failed to set MikroTik DHCP hostname");
            }
        }
    }

    if updated > 0 {
        info!(
            updated,
            total_leases = leases.len(),
            "MikroTik DHCP hostname enrichment complete"
        );
    }
}

/// Run a single Xiaomi MiWiFi device list enrichment pass.
///
/// Fetches the device list from the Xiaomi router and updates device hostnames/names
/// for devices that don't already have one.
pub async fn enrich_from_xiaomi_devices(pool: &SqlitePool) {
    let enabled = get_setting(pool, "xiaomi_mesh_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return;
    }

    let ip = match get_setting(pool, "xiaomi_mesh_ip").await {
        Some(i) => i,
        None => return,
    };
    let password = match get_setting(pool, "xiaomi_mesh_password").await {
        Some(p) => p,
        None => return,
    };

    let http = crate::xiaomi::client::shared_http_client();
    let client = XiaomiClient::new(&ip, &password, http);

    let devices = match client.device_list().await {
        Ok(d) => d,
        Err(e) => {
            debug!("Xiaomi enrichment: failed to fetch device list: {e}");
            return;
        }
    };

    if devices.is_empty() {
        debug!("Xiaomi enrichment: no devices found");
        return;
    }

    let mut updated = 0u32;
    for dev in &devices {
        let mac = match dev.mac {
            Some(ref m) => m.to_lowercase(),
            None => continue,
        };

        // Xiaomi returns a friendly name set by the user or auto-detected.
        let device_name = match dev.name {
            Some(ref n) if !n.is_empty() => n,
            _ => continue,
        };

        // Update the name field for devices that don't already have one.
        // Use `name` (not hostname) since Xiaomi names are user-friendly labels.
        let result = sqlx::query(
            r#"UPDATE devices SET name = ?, updated_at = datetime('now')
               WHERE mac = ? AND (name IS NULL OR name = '')"#,
        )
        .bind(device_name)
        .bind(&mac)
        .execute(pool)
        .await;

        match result {
            Ok(r) if r.rows_affected() > 0 => {
                info!(mac = %mac, name = %device_name, "Xiaomi device name set");
                updated += 1;
            }
            Ok(_) => {}
            Err(e) => {
                warn!(mac = %mac, error = %e, "Failed to set Xiaomi device name");
            }
        }

        // Also try to set hostname from the Xiaomi device's IP entries
        // (Xiaomi sometimes provides a hostname-like identifier)
        if let Some(ref ip_list) = Some(&dev.ip) {
            for ip_entry in ip_list.iter() {
                if let Some(ref dev_ip) = ip_entry.ip {
                    // Update hostname via IP match if device has no hostname yet
                    let _ = sqlx::query(
                        r#"UPDATE devices SET hostname = COALESCE(hostname, ?), updated_at = datetime('now')
                           WHERE id IN (
                               SELECT device_id FROM device_ips WHERE ip = ? AND is_current = 1
                           ) AND (hostname IS NULL OR hostname = '')"#,
                    )
                    .bind(device_name)
                    .bind(dev_ip)
                    .execute(pool)
                    .await;
                }
            }
        }
    }

    if updated > 0 {
        info!(
            updated,
            total_devices = devices.len(),
            "Xiaomi device name enrichment complete"
        );
    }
}

/// Re-run enrichment heuristics for a device identified by MAC.
///
/// Called after setting a new hostname so the enrichment engine can extract
/// OS, type, and model information from the newly discovered hostname.
async fn trigger_enrichment_for_mac(pool: &SqlitePool, mac: &str) {
    let row: Option<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        r#"SELECT d.id, d.hostname, d.vendor, d.mdns_services
           FROM devices d WHERE d.mac = ?"#,
    )
    .bind(mac)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if let Some((device_id, hostname, vendor, mdns_services)) = row {
        crate::enrichment::enrich_device(
            pool,
            &device_id,
            "", // IP not needed for hostname-based enrichment
            mac,
            hostname.as_deref(),
            vendor.as_deref(),
            mdns_services.as_deref(),
            None,
        )
        .await;
    }
}

/// Run all device identification sources in sequence.
///
/// Called periodically and can also be triggered manually via the API.
pub async fn run_all_identification(pool: &SqlitePool, config: &AppConfig) {
    enrich_from_dhcp_leases(pool, config).await;
    enrich_from_mikrotik_leases(pool).await;
    enrich_from_xiaomi_devices(pool).await;
}

/// Start the periodic device identification task.
///
/// Runs every 5 minutes to pick up new DHCP leases and device names
/// from all configured sources: VyOS, MikroTik, and Xiaomi MiWiFi.
pub fn start_dhcp_enrichment_task(pool: SqlitePool, config: AppConfig) {
    info!("Starting device identification enrichment (every 5 min)");
    tokio::spawn(async move {
        // Initial delay to let the server start up.
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            run_all_identification(&pool, &config).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dhcp_text_format() {
        let text = r#"IP Address      MAC Address         Hostname        Pool    Expiry
----------      -----------         --------        ----    ------
10.10.0.100     aa:bb:cc:dd:ee:01   mydesktop       LAN     2026-02-22T12:00:00
10.10.0.101     aa:bb:cc:dd:ee:02   *               LAN     2026-02-22T12:00:00
10.10.0.102     aa:bb:cc:dd:ee:03   iphone-oleg     LAN     2026-02-22T12:00:00
"#;
        let leases = parse_dhcp_leases(text);
        assert_eq!(leases.len(), 3);
        assert_eq!(leases[0].hostname.as_deref(), Some("mydesktop"));
        assert!(leases[1].hostname.is_none()); // "*" is filtered
        assert_eq!(leases[2].hostname.as_deref(), Some("iphone-oleg"));
    }

    #[test]
    fn test_parse_dhcp_json_format() {
        let json =
            r#"{"data":{"LAN":{"10.10.0.100":{"mac":"aa:bb:cc:dd:ee:01","hostname":"mypc"}}}}"#;
        let leases = parse_dhcp_leases(json);
        assert_eq!(leases.len(), 1);
        assert_eq!(leases[0]._ip, "10.10.0.100");
        assert_eq!(leases[0].mac, "aa:bb:cc:dd:ee:01");
        assert_eq!(leases[0].hostname.as_deref(), Some("mypc"));
    }
}
