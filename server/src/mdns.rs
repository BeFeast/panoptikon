//! Passive mDNS/Bonjour listener for discovering device hostnames and service types.
//!
//! Runs as a background tokio task alongside the ARP scanner.
//! Listens for mDNS service announcements on the local network and enriches
//! the devices table with discovered hostnames and service types.

use mdns_sd::{ServiceDaemon, ServiceEvent};
use sqlx::SqlitePool;
use tracing::{debug, info, warn};

use crate::config::AppConfig;

/// Meta-query service type that discovers all available service types on the network.
const META_SERVICE: &str = "_services._dns-sd._udp.local.";

/// Start the passive mDNS discovery background task.
///
/// Browses for all mDNS services, and for each resolved service:
/// - Updates the device hostname (if not already set) by matching on IP
/// - Stores discovered service types in the `mdns_services` column
pub async fn start_mdns_discovery(pool: SqlitePool, _config: AppConfig) {
    info!("Starting mDNS/Bonjour passive discovery");

    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            warn!("Failed to create mDNS daemon (multicast may not be supported on this interface): {e}");
            return;
        }
    };

    // Browse for the meta-service to discover all service types on the network
    let receiver = match daemon.browse(META_SERVICE) {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to browse mDNS services: {e}");
            return;
        }
    };

    // Track which service types we're already browsing to avoid duplicates
    let mut browsed_types: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        match receiver.recv_async().await {
            Ok(event) => match event {
                ServiceEvent::ServiceFound(service_type, full_name) => {
                    debug!("mDNS meta: found service type {service_type} / {full_name}");
                    // The meta-query returns service types as the full_name.
                    // Extract and browse each discovered service type.
                    let stype = extract_service_type(&full_name);
                    if !stype.is_empty() && browsed_types.insert(stype.clone()) {
                        debug!("Browsing mDNS service type: {stype}");
                        if let Err(e) = daemon.browse(&stype) {
                            warn!("Failed to browse mDNS service {stype}: {e}");
                        }
                    }
                }
                ServiceEvent::ServiceResolved(info) => {
                    let hostname = info.get_hostname().trim_end_matches('.').to_string();
                    let service_type = info.ty_domain.clone();
                    let addresses = info.get_addresses();

                    debug!(
                        "mDNS resolved: hostname={hostname} type={service_type} IPs={addresses:?}"
                    );

                    for addr in addresses {
                        let ip_str = addr.to_ip_addr().to_string();
                        if let Err(e) =
                            upsert_mdns_info(&pool, &ip_str, &hostname, &service_type).await
                        {
                            warn!("Failed to upsert mDNS info for {ip_str}: {e}");
                        }
                    }
                }
                ServiceEvent::ServiceRemoved(_service_type, full_name) => {
                    debug!("mDNS service removed: {full_name}");
                }
                ServiceEvent::SearchStarted(s) => {
                    debug!("mDNS search started: {s}");
                }
                ServiceEvent::SearchStopped(s) => {
                    debug!("mDNS search stopped: {s}");
                }
                _ => {
                    // Handle any future ServiceEvent variants gracefully
                }
            },
            Err(e) => {
                warn!("mDNS receiver error: {e}");
                // Brief delay before retrying to avoid busy-looping
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

/// Extract a browseable service type from a meta-query response name.
///
/// The meta-query returns names like `_http._tcp.local.` — we need the
/// full type string suitable for browsing (e.g. `_http._tcp.local.`).
fn extract_service_type(full_name: &str) -> String {
    // The full_name from meta-query is typically the service type itself
    // e.g., "_http._tcp.local." or "_airplay._tcp.local."
    let trimmed = full_name.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // Ensure it ends with a dot (FQDN style)
    if trimmed.ends_with('.') {
        trimmed.to_string()
    } else {
        format!("{trimmed}.")
    }
}

/// Upsert mDNS-discovered hostname and service type into the devices table.
///
/// - Sets hostname only if the device currently has no hostname (doesn't overwrite).
/// - Appends the service type to mdns_services if not already present.
pub async fn upsert_mdns_info(
    pool: &SqlitePool,
    ip: &str,
    hostname: &str,
    service_type: &str,
) -> Result<(), sqlx::Error> {
    // Find the device by IP address (via device_ips table)
    let device: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        r#"SELECT d.id, d.hostname, d.mdns_services
           FROM devices d
           JOIN device_ips di ON di.device_id = d.id
           WHERE di.ip = ? AND di.is_current = 1
           LIMIT 1"#,
    )
    .bind(ip)
    .fetch_optional(pool)
    .await?;

    let (device_id, current_hostname, current_services) = match device {
        Some(d) => d,
        None => {
            debug!("mDNS: no device found for IP {ip}, skipping");
            return Ok(());
        }
    };

    // Update hostname if device doesn't have one yet
    if current_hostname.is_none() && !hostname.is_empty() {
        sqlx::query(r#"UPDATE devices SET hostname = ? WHERE id = ? AND hostname IS NULL"#)
            .bind(hostname)
            .bind(&device_id)
            .execute(pool)
            .await?;
        info!("mDNS: set hostname '{hostname}' for device {device_id} (IP: {ip})");
    }

    // Clean up service type for storage: remove ".local." suffix and trailing dot
    let clean_service = service_type
        .trim_end_matches('.')
        .trim_end_matches(".local")
        .to_string();

    if clean_service.is_empty() {
        return Ok(());
    }

    // Append service type to mdns_services if not already present
    let new_services = match current_services {
        Some(ref existing) if !existing.is_empty() => {
            let services: Vec<&str> = existing.split(',').map(|s| s.trim()).collect();
            if services.iter().any(|s| *s == clean_service) {
                return Ok(()); // Already present
            }
            format!("{existing},{clean_service}")
        }
        _ => clean_service.clone(),
    };

    sqlx::query(r#"UPDATE devices SET mdns_services = ? WHERE id = ?"#)
        .bind(&new_services)
        .bind(&device_id)
        .execute(pool)
        .await?;

    debug!("mDNS: updated services for device {device_id}: {new_services}");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: insert a test device with an IP, optionally with a hostname.
    async fn insert_device_with_ip(
        pool: &SqlitePool,
        mac: &str,
        ip: &str,
        hostname: Option<&str>,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, hostname, first_seen_at, last_seen_at)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(mac)
        .bind(hostname)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        sqlx::query(
            r#"INSERT INTO device_ips (device_id, ip, seen_at, is_current)
               VALUES (?, ?, ?, 1)"#,
        )
        .bind(&id)
        .bind(ip)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        id
    }

    /// Helper: get device hostname from DB.
    async fn get_hostname(pool: &SqlitePool, device_id: &str) -> Option<String> {
        sqlx::query_scalar(r#"SELECT hostname FROM devices WHERE id = ?"#)
            .bind(device_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    /// Helper: get mdns_services from DB.
    async fn get_mdns_services(pool: &SqlitePool, device_id: &str) -> Option<String> {
        sqlx::query_scalar(r#"SELECT mdns_services FROM devices WHERE id = ?"#)
            .bind(device_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_mdns_hostname_update() {
        let pool = test_db().await;
        let device_id =
            insert_device_with_ip(&pool, "AA:BB:CC:DD:EE:01", "192.168.1.10", None).await;

        // Device has no hostname — mDNS should set it
        upsert_mdns_info(&pool, "192.168.1.10", "myprinter", "_ipp._tcp.local.")
            .await
            .unwrap();

        let hostname = get_hostname(&pool, &device_id).await;
        assert_eq!(
            hostname,
            Some("myprinter".to_string()),
            "mDNS should set hostname when device has none"
        );
    }

    #[tokio::test]
    async fn test_mdns_doesnt_overwrite_existing_hostname() {
        let pool = test_db().await;
        let device_id = insert_device_with_ip(
            &pool,
            "AA:BB:CC:DD:EE:02",
            "192.168.1.20",
            Some("existing-name"),
        )
        .await;

        // Device already has a hostname — mDNS should NOT overwrite it
        upsert_mdns_info(&pool, "192.168.1.20", "new-mdns-name", "_http._tcp.local.")
            .await
            .unwrap();

        let hostname = get_hostname(&pool, &device_id).await;
        assert_eq!(
            hostname,
            Some("existing-name".to_string()),
            "mDNS should NOT overwrite existing hostname"
        );
    }

    #[tokio::test]
    async fn test_mdns_service_stored() {
        let pool = test_db().await;
        let device_id =
            insert_device_with_ip(&pool, "AA:BB:CC:DD:EE:03", "192.168.1.30", None).await;

        // First service
        upsert_mdns_info(&pool, "192.168.1.30", "smart-tv", "_airplay._tcp.local.")
            .await
            .unwrap();

        let services = get_mdns_services(&pool, &device_id).await;
        assert_eq!(
            services,
            Some("_airplay._tcp".to_string()),
            "First service should be stored"
        );

        // Second service — should be appended
        upsert_mdns_info(&pool, "192.168.1.30", "smart-tv", "_smb._tcp.local.")
            .await
            .unwrap();

        let services = get_mdns_services(&pool, &device_id).await;
        assert_eq!(
            services,
            Some("_airplay._tcp,_smb._tcp".to_string()),
            "Second service should be appended"
        );

        // Duplicate service — should NOT be added again
        upsert_mdns_info(&pool, "192.168.1.30", "smart-tv", "_airplay._tcp.local.")
            .await
            .unwrap();

        let services = get_mdns_services(&pool, &device_id).await;
        assert_eq!(
            services,
            Some("_airplay._tcp,_smb._tcp".to_string()),
            "Duplicate service should not be added again"
        );
    }

    #[tokio::test]
    async fn test_mdns_unknown_ip_ignored() {
        let pool = test_db().await;

        // No device exists for this IP — should not error
        let result =
            upsert_mdns_info(&pool, "10.0.0.99", "unknown-host", "_http._tcp.local.").await;
        assert!(result.is_ok(), "Unknown IP should be silently ignored");
    }

    #[test]
    fn test_extract_service_type() {
        assert_eq!(
            extract_service_type("_http._tcp.local."),
            "_http._tcp.local."
        );
        assert_eq!(
            extract_service_type("_airplay._tcp.local"),
            "_airplay._tcp.local."
        );
        assert_eq!(extract_service_type(""), "");
    }
}
