//! External device identification — resolve unknown devices via DHCP hostnames
//! from MikroTik, Xiaomi MiWiFi device list, and reverse DNS.
//!
//! This module queries configured routers' DHCP/device APIs to find hostnames
//! for devices with randomized MACs that OUI lookup cannot identify.
//! Results are cached in the `devices` table as `hostname` (from DHCP) or
//! `name` (user-assigned name from Xiaomi router).

use sqlx::SqlitePool;
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// A hostname discovered from an external source.
#[derive(Debug, Clone)]
pub struct IdentifiedDevice {
    /// MAC address (lowercase, colon-separated).
    pub mac: String,
    /// IP address.
    pub ip: Option<String>,
    /// Hostname from DHCP or device name from router.
    pub hostname: Option<String>,
    /// Source of identification ("mikrotik_dhcp", "xiaomi").
    pub source: &'static str,
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

/// Query MikroTik DHCP leases for device hostnames.
///
/// Returns a map of MAC → hostname from active DHCP leases.
async fn fetch_mikrotik_dhcp_hostnames(
    db: &SqlitePool,
    http: &reqwest::Client,
) -> HashMap<String, String> {
    let mut result = HashMap::new();

    // Check if MikroTik is enabled and configured.
    let enabled = get_setting(db, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return result;
    }

    let url = match get_setting(db, "mikrotik_url").await {
        Some(u) => u,
        None => return result,
    };
    let user = get_setting(db, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(db, "mikrotik_password")
        .await
        .unwrap_or_default();

    let client =
        crate::mikrotik::client::MikrotikClient::with_http(&url, &user, &password, http.clone());

    match client.dhcp_leases().await {
        Ok(leases) => {
            for lease in &leases {
                if let (Some(mac), Some(hostname)) =
                    (lease.mac_address.as_ref(), lease.host_name.as_ref())
                {
                    if !hostname.is_empty() {
                        let mac_lower = mac.to_lowercase();
                        result.insert(mac_lower, hostname.clone());
                    }
                }
            }
            info!(
                leases_total = leases.len(),
                with_hostname = result.len(),
                "MikroTik DHCP leases fetched for device identification"
            );
        }
        Err(e) => {
            warn!(error = %e, "Failed to fetch MikroTik DHCP leases for device identification");
        }
    }

    result
}

/// Query Xiaomi MiWiFi device list for device names/hostnames.
///
/// Returns a map of MAC → device name from the Xiaomi router.
async fn fetch_xiaomi_device_names(
    db: &SqlitePool,
    http: &reqwest::Client,
) -> HashMap<String, String> {
    let mut result = HashMap::new();

    let enabled = get_setting(db, "xiaomi_mesh_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return result;
    }

    let ip = match get_setting(db, "xiaomi_mesh_ip").await {
        Some(ip) => ip,
        None => return result,
    };
    let password = match get_setting(db, "xiaomi_mesh_password").await {
        Some(p) => p,
        None => return result,
    };

    let client = crate::xiaomi::client::XiaomiClient::new(&ip, &password, http.clone());

    match client.device_list().await {
        Ok(devices) => {
            for dev in &devices {
                if let Some(mac) = dev.mac.as_ref() {
                    let mac_lower = mac.to_lowercase();
                    // Prefer the user-assigned name, which is more meaningful.
                    if let Some(ref name) = dev.name {
                        if !name.is_empty() {
                            result.insert(mac_lower, name.clone());
                        }
                    }
                }
            }
            info!(
                devices_total = devices.len(),
                with_name = result.len(),
                "Xiaomi device list fetched for device identification"
            );
        }
        Err(e) => {
            warn!(error = %e, "Failed to fetch Xiaomi device list for device identification");
        }
    }

    result
}

/// Identify devices using external sources (MikroTik DHCP, Xiaomi router).
///
/// For each discovered device, try to find a hostname from:
/// 1. MikroTik DHCP leases (matches by MAC)
/// 2. Xiaomi MiWiFi device list (matches by MAC)
///
/// Updates the `hostname` column in the `devices` table if a match is found
/// and the device doesn't already have a hostname from a higher-priority source.
pub async fn identify_from_external_sources(db: &SqlitePool, device_macs: &[(String, String)]) {
    if device_macs.is_empty() {
        return;
    }

    // Create dedicated HTTP clients for router queries.
    // These are lightweight — the actual TCP connections are pooled per-host.
    let mikrotik_http = crate::mikrotik::client::shared_http_client();
    let xiaomi_http = crate::xiaomi::client::shared_http_client();

    // Fetch hostnames from all external sources concurrently.
    let (mikrotik_hostnames, xiaomi_names) = tokio::join!(
        fetch_mikrotik_dhcp_hostnames(db, &mikrotik_http),
        fetch_xiaomi_device_names(db, &xiaomi_http),
    );

    let total_external = if mikrotik_hostnames.is_empty() && xiaomi_names.is_empty() {
        return;
    } else {
        mikrotik_hostnames.len() + xiaomi_names.len()
    };

    debug!(
        mikrotik = mikrotik_hostnames.len(),
        xiaomi = xiaomi_names.len(),
        "External hostname sources loaded"
    );

    let mut updated = 0u32;

    for (device_id, mac) in device_macs {
        let mac_lower = mac.to_lowercase();

        // Check if device already has a hostname (don't overwrite reverse DNS or user-set names).
        let existing: Option<(Option<String>, Option<String>)> =
            sqlx::query_as("SELECT hostname, name FROM devices WHERE id = ?")
                .bind(device_id)
                .fetch_optional(db)
                .await
                .ok()
                .flatten();

        let (current_hostname, _current_name) = match existing {
            Some((h, n)) => (h, n),
            None => continue,
        };

        // Priority 1: MikroTik DHCP hostname → sets `hostname` column.
        if current_hostname.is_none() || current_hostname.as_deref() == Some("") {
            if let Some(dhcp_hostname) = mikrotik_hostnames.get(&mac_lower) {
                if let Err(e) = sqlx::query(
                    "UPDATE devices SET hostname = ?, updated_at = datetime('now') WHERE id = ? AND (hostname IS NULL OR hostname = '')",
                )
                .bind(dhcp_hostname)
                .bind(device_id)
                .execute(db)
                .await
                {
                    warn!(device_id, error = %e, "Failed to update hostname from MikroTik DHCP");
                } else {
                    debug!(device_id, hostname = %dhcp_hostname, "Device identified via MikroTik DHCP");
                    updated += 1;
                    continue; // Don't overwrite with lower-priority source
                }
            }
        }

        // Priority 2: Xiaomi device name → sets `hostname` column (since `name` is user-assigned).
        if current_hostname.is_none() || current_hostname.as_deref() == Some("") {
            if let Some(xiaomi_name) = xiaomi_names.get(&mac_lower) {
                if let Err(e) = sqlx::query(
                    "UPDATE devices SET hostname = ?, updated_at = datetime('now') WHERE id = ? AND (hostname IS NULL OR hostname = '')",
                )
                .bind(xiaomi_name)
                .bind(device_id)
                .execute(db)
                .await
                {
                    warn!(device_id, error = %e, "Failed to update hostname from Xiaomi");
                } else {
                    debug!(device_id, hostname = %xiaomi_name, "Device identified via Xiaomi router");
                    updated += 1;
                }
            }
        }
    }

    if updated > 0 {
        info!(
            updated,
            total_external, "Devices identified from external sources"
        );
    }
}
