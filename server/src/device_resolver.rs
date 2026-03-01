//! Device identity resolver — resolves unknown devices via DHCP hostnames from routers.
//!
//! Queries MikroTik DHCP leases and Xiaomi device list to discover
//! hostnames for devices that currently show as "Unknown Device".
//! This supplements the existing reverse DNS and enrichment pipeline
//! by pulling names from router APIs that have direct visibility
//! into DHCP hostname options.

use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// Summary of a device resolve operation.
#[derive(Debug, Default, Serialize)]
pub struct ResolveResult {
    /// Number of devices that were updated with a new hostname.
    pub resolved: u32,
    /// Total number of devices that were candidates (no hostname).
    pub candidates: u32,
    /// Which sources were successfully queried.
    pub sources_queried: Vec<String>,
}

/// A hostname mapping discovered from an external source.
struct HostnameMapping {
    hostname: String,
    source: String,
}

/// Read a setting value from the database.
async fn get_setting(db: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Fetch DHCP leases from MikroTik and return MAC→hostname mappings.
async fn fetch_mikrotik_hostnames(db: &SqlitePool) -> Option<Vec<(String, HostnameMapping)>> {
    let enabled = get_setting(db, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        debug!("MikroTik not enabled, skipping DHCP lease fetch");
        return None;
    }

    let url = get_setting(db, "mikrotik_url").await?;
    let user = get_setting(db, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(db, "mikrotik_password")
        .await
        .unwrap_or_default();

    let http = crate::mikrotik::client::shared_http_client();
    let client = crate::mikrotik::client::MikrotikClient::with_http(&url, &user, &password, http);

    match client.dhcp_leases().await {
        Ok(leases) => {
            let mut mappings = Vec::new();
            for lease in leases {
                if let (Some(mac), Some(hostname)) = (&lease.mac_address, &lease.host_name) {
                    if !hostname.is_empty() {
                        mappings.push((
                            mac.to_lowercase(),
                            HostnameMapping {
                                hostname: hostname.clone(),
                                source: "mikrotik_dhcp".to_string(),
                            },
                        ));
                    }
                }
            }
            info!(
                count = mappings.len(),
                "Fetched hostnames from MikroTik DHCP leases"
            );
            Some(mappings)
        }
        Err(e) => {
            warn!(error = %e, "Failed to fetch MikroTik DHCP leases for device resolution");
            None
        }
    }
}

/// Fetch device names from Xiaomi MiWiFi and return MAC→hostname mappings.
async fn fetch_xiaomi_hostnames(db: &SqlitePool) -> Option<Vec<(String, HostnameMapping)>> {
    let enabled = get_setting(db, "xiaomi_mesh_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        debug!("Xiaomi mesh not enabled, skipping device list fetch");
        return None;
    }

    let ip = get_setting(db, "xiaomi_mesh_ip")
        .await
        .unwrap_or_else(|| "10.10.0.199".to_string());
    let password = get_setting(db, "xiaomi_mesh_password").await?;
    let proxy_host = get_setting(db, "xiaomi_mesh_proxy_host").await;

    let http = crate::xiaomi::client::shared_http_client();
    let client =
        crate::xiaomi::client::XiaomiClient::new(&ip, &password, http, proxy_host.as_deref());

    match client.device_list().await {
        Ok(devices) => {
            let mut mappings = Vec::new();
            for dev in devices {
                if let (Some(mac), Some(name)) = (&dev.mac, &dev.name) {
                    if !name.is_empty() {
                        mappings.push((
                            mac.to_lowercase(),
                            HostnameMapping {
                                hostname: name.clone(),
                                source: "xiaomi".to_string(),
                            },
                        ));
                    }
                }
            }
            info!(
                count = mappings.len(),
                "Fetched device names from Xiaomi MiWiFi"
            );
            Some(mappings)
        }
        Err(e) => {
            warn!(error = %e, "Failed to fetch Xiaomi device list for device resolution");
            None
        }
    }
}

/// Resolve unknown/unnamed devices by querying external sources.
///
/// Sources (in priority order):
/// 1. MikroTik DHCP leases (hostname from DHCP option 12)
/// 2. Xiaomi MiWiFi device list (name assigned by router)
///
/// Only updates devices that have no hostname set yet.
/// Respects `enrichment_corrected` — never overwrites user corrections.
pub async fn resolve_devices(db: &SqlitePool) -> ResolveResult {
    let mut result = ResolveResult::default();

    // Collect MAC→hostname mappings from all sources.
    // First source wins (MikroTik DHCP is higher priority).
    let mut mac_to_hostname: HashMap<String, HostnameMapping> = HashMap::new();

    // Source 1: MikroTik DHCP leases (priority 1)
    if let Some(mappings) = fetch_mikrotik_hostnames(db).await {
        result.sources_queried.push("mikrotik".to_string());
        for (mac, mapping) in mappings {
            mac_to_hostname.entry(mac).or_insert(mapping);
        }
    }

    // Source 2: Xiaomi device list (priority 2)
    if let Some(mappings) = fetch_xiaomi_hostnames(db).await {
        result.sources_queried.push("xiaomi".to_string());
        for (mac, mapping) in mappings {
            mac_to_hostname.entry(mac).or_insert(mapping);
        }
    }

    if mac_to_hostname.is_empty() {
        debug!("No hostname mappings collected from any source");
        return result;
    }

    info!(
        mappings = mac_to_hostname.len(),
        sources = ?result.sources_queried,
        "Collected hostname mappings for device resolution"
    );

    // Count candidates: devices with no hostname.
    let candidate_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE hostname IS NULL")
            .fetch_one(db)
            .await
            .unwrap_or(0);
    result.candidates = candidate_count as u32;

    // Apply collected hostnames to devices missing names.
    let now = chrono::Utc::now().to_rfc3339();

    for (mac, mapping) in &mac_to_hostname {
        // Update hostname for devices that don't have one yet.
        // Also set name if it's null (display name), and mark as known.
        let updated = sqlx::query(
            "UPDATE devices SET \
             hostname = ?, \
             name = COALESCE(name, ?), \
             is_known = 1, \
             updated_at = ? \
             WHERE mac = ? AND hostname IS NULL",
        )
        .bind(&mapping.hostname)
        .bind(&mapping.hostname)
        .bind(&now)
        .bind(mac)
        .execute(db)
        .await;

        match updated {
            Ok(r) if r.rows_affected() > 0 => {
                result.resolved += 1;
                info!(
                    mac = %mac,
                    hostname = %mapping.hostname,
                    source = %mapping.source,
                    "Device identified via DHCP/router"
                );

                // Trigger enrichment with the new hostname.
                let device_id: Option<String> =
                    sqlx::query_scalar("SELECT id FROM devices WHERE mac = ?")
                        .bind(mac)
                        .fetch_optional(db)
                        .await
                        .ok()
                        .flatten();

                if let Some(device_id) = device_id {
                    let vendor: Option<String> =
                        sqlx::query_scalar("SELECT vendor FROM devices WHERE id = ?")
                            .bind(&device_id)
                            .fetch_optional(db)
                            .await
                            .ok()
                            .flatten();
                    let mdns_services: Option<String> =
                        sqlx::query_scalar("SELECT mdns_services FROM devices WHERE id = ?")
                            .bind(&device_id)
                            .fetch_optional(db)
                            .await
                            .ok()
                            .flatten();

                    crate::enrichment::enrich_device(
                        db,
                        &device_id,
                        "",
                        mac,
                        Some(&mapping.hostname),
                        vendor.as_deref(),
                        mdns_services.as_deref(),
                        None,
                    )
                    .await;
                }
            }
            Ok(_) => {
                // Device already had a hostname or MAC not in our DB
            }
            Err(e) => {
                warn!(mac = %mac, error = %e, "Failed to update device hostname");
            }
        }
    }

    info!(
        resolved = result.resolved,
        candidates = result.candidates,
        "Device resolution complete"
    );

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_resolve_result_default() {
        let result = ResolveResult::default();
        assert_eq!(result.resolved, 0);
        assert_eq!(result.candidates, 0);
        assert!(result.sources_queried.is_empty());
    }

    #[tokio::test]
    async fn test_resolve_no_sources_configured() {
        let pool = crate::db::init(":memory:").await.unwrap();
        let result = resolve_devices(&pool).await;
        // With no settings configured, no sources should be queried
        assert_eq!(result.resolved, 0);
        assert!(result.sources_queried.is_empty());
    }
}
