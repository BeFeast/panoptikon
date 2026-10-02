//! External device identification — resolve unknown devices via external
//! hostname sources (seeded pfSense ARP map, MikroTik DHCP, Xiaomi MiWiFi).
//!
//! This module queries configured router/device APIs and local seeded mappings
//! to find hostnames for devices with randomized MACs that OUI lookup cannot
//! identify. Results are cached in the `devices` table as `hostname` and
//! (when empty) `name`.

use sqlx::SqlitePool;
use std::collections::HashMap;
use tracing::{debug, info, warn};

use crate::xiaomi::client::XiaomiClients;

/// A hostname discovered from an external source.
#[derive(Debug, Clone)]
pub struct IdentifiedDevice {
    /// MAC address (lowercase, colon-separated).
    pub mac: String,
    /// IP address.
    pub ip: Option<String>,
    /// Hostname from DHCP or device name from router.
    pub hostname: Option<String>,
    /// Source of identification ("external_seed", "mikrotik_dhcp", "xiaomi").
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

/// Load hostnames from the local external_hostnames seed table.
///
/// This is used as a pragmatic hotfix source (pfSense ARP snapshot), so
/// production devices can be named immediately even when router DHCP source
/// is currently configured for a different gateway.
async fn fetch_seeded_external_hostnames(db: &SqlitePool) -> HashMap<String, String> {
    let mut result = HashMap::new();

    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT mac, hostname FROM external_hostnames WHERE hostname IS NOT NULL AND TRIM(hostname) != ''",
    )
    .fetch_all(db)
    .await;

    match rows {
        Ok(rows) => {
            for (mac, hostname) in rows {
                let mac_lower = mac.to_lowercase();
                result.entry(mac_lower).or_insert(hostname);
            }
            if !result.is_empty() {
                info!(
                    count = result.len(),
                    "Seeded external hostnames loaded for device identification"
                );
            }
        }
        Err(e) => {
            // Table may not exist on old DB versions before migration 029.
            debug!(error = %e, "external_hostnames table unavailable, skipping seeded hostnames");
        }
    }

    result
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
    xiaomi_clients: &XiaomiClients,
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
    let proxy_host = get_setting(db, "xiaomi_mesh_proxy_host").await;

    let client = xiaomi_clients.client_for(&ip, &password, proxy_host.as_deref());

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

/// Identify devices using external sources (seeded pfSense ARP, MikroTik DHCP, Xiaomi router).
///
/// Priority (high → low):
/// 1. Seeded external hostnames (`external_hostnames` table)
/// 2. MikroTik DHCP leases
/// 3. Xiaomi MiWiFi device list
///
/// Never overwrites an existing hostname.
pub async fn identify_from_external_sources(
    db: &SqlitePool,
    device_macs: &[(String, String)],
    xiaomi_clients: &XiaomiClients,
) {
    if device_macs.is_empty() {
        return;
    }

    let mikrotik_http = crate::mikrotik::client::shared_http_client();

    // Fetch hostnames from all external sources concurrently.
    let (seeded_hostnames, mikrotik_hostnames, xiaomi_names) = tokio::join!(
        fetch_seeded_external_hostnames(db),
        fetch_mikrotik_dhcp_hostnames(db, &mikrotik_http),
        fetch_xiaomi_device_names(db, xiaomi_clients),
    );

    let total_external = seeded_hostnames.len() + mikrotik_hostnames.len() + xiaomi_names.len();
    if total_external == 0 {
        return;
    }

    debug!(
        seeded = seeded_hostnames.len(),
        mikrotik = mikrotik_hostnames.len(),
        xiaomi = xiaomi_names.len(),
        "External hostname sources loaded"
    );

    let mut updated = 0u32;

    for (device_id, mac) in device_macs {
        let mac_lower = mac.to_lowercase();

        // Check if device already has a hostname (don't overwrite reverse DNS or user-set names).
        let current_hostname: Option<String> =
            sqlx::query_scalar("SELECT hostname FROM devices WHERE id = ?")
                .bind(device_id)
                .fetch_optional(db)
                .await
                .ok()
                .flatten()
                .flatten();

        if current_hostname
            .as_deref()
            .is_some_and(|h| !h.trim().is_empty())
        {
            continue;
        }

        // Priority 1: seeded external map (pfSense ARP hotfix).
        if let Some(hostname) = seeded_hostnames.get(&mac_lower) {
            if let Err(e) = sqlx::query(
                "UPDATE devices SET hostname = ?, name = COALESCE(name, ?), is_known = 1, updated_at = datetime('now') WHERE id = ? AND (hostname IS NULL OR TRIM(hostname) = '')",
            )
            .bind(hostname)
            .bind(hostname)
            .bind(device_id)
            .execute(db)
            .await
            {
                warn!(device_id, error = %e, "Failed to update hostname from seeded external source");
            } else {
                debug!(device_id, hostname = %hostname, "Device identified via seeded external hostname source");
                updated += 1;
                continue;
            }
        }

        // Priority 2: MikroTik DHCP hostname.
        if let Some(dhcp_hostname) = mikrotik_hostnames.get(&mac_lower) {
            if let Err(e) = sqlx::query(
                "UPDATE devices SET hostname = ?, name = COALESCE(name, ?), is_known = 1, updated_at = datetime('now') WHERE id = ? AND (hostname IS NULL OR TRIM(hostname) = '')",
            )
            .bind(dhcp_hostname)
            .bind(dhcp_hostname)
            .bind(device_id)
            .execute(db)
            .await
            {
                warn!(device_id, error = %e, "Failed to update hostname from MikroTik DHCP");
            } else {
                debug!(device_id, hostname = %dhcp_hostname, "Device identified via MikroTik DHCP");
                updated += 1;
                continue;
            }
        }

        // Priority 3: Xiaomi device name.
        if let Some(xiaomi_name) = xiaomi_names.get(&mac_lower) {
            if let Err(e) = sqlx::query(
                "UPDATE devices SET hostname = ?, name = COALESCE(name, ?), is_known = 1, updated_at = datetime('now') WHERE id = ? AND (hostname IS NULL OR TRIM(hostname) = '')",
            )
            .bind(xiaomi_name)
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

    if updated > 0 {
        info!(
            updated,
            total_external, "Devices identified from external sources"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scanner::{process_scan_results, DiscoveredDevice, ScanContext};
    use crate::ws::hub::WsHub;
    use crate::xiaomi::mock::MockMiwifi;

    async fn pool_with_xiaomi(addr: &str) -> SqlitePool {
        let pool = crate::db::init(":memory:").await.expect("DB init failed");
        for (key, value) in [
            ("xiaomi_mesh_enabled", "1"),
            ("xiaomi_mesh_ip", addr),
            ("xiaomi_mesh_password", "pw"),
        ] {
            sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
                .bind(key)
                .bind(value)
                .execute(&pool)
                .await
                .unwrap();
        }
        pool
    }

    #[tokio::test]
    async fn scan_cycles_log_in_to_xiaomi_once() {
        let mock = MockMiwifi::start().await;
        let pool = pool_with_xiaomi(&mock.addr).await;
        let ws_hub = WsHub::new();
        let ctx = ScanContext::default();
        let devices = vec![DiscoveredDevice {
            ip: "127.0.0.1".to_string(),
            mac: "aa:bb:cc:00:00:01".to_string(),
        }];

        for _ in 0..5 {
            process_scan_results(&pool, &devices, 300, &ws_hub, &ctx)
                .await
                .expect("scan cycle");
        }

        assert_eq!(mock.logins(), 1, "one login across all scan cycles");
        assert_eq!(mock.authed_calls(), 5, "device list fetched every cycle");
    }

    #[tokio::test]
    async fn scan_cycle_relogs_once_after_token_revoked() {
        let mock = MockMiwifi::start().await;
        let pool = pool_with_xiaomi(&mock.addr).await;
        let clients = XiaomiClients::new();
        let macs = vec![("dev-1".to_string(), "aa:bb:cc:00:00:09".to_string())];

        identify_from_external_sources(&pool, &macs, &clients).await;
        mock.revoke_token();
        for _ in 0..5 {
            identify_from_external_sources(&pool, &macs, &clients).await;
        }

        assert_eq!(mock.logins(), 2);
    }
}
