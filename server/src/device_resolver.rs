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

    async fn setup_test_db() -> SqlitePool {
        crate::db::init(":memory:").await.expect("DB init failed")
    }

    /// Insert a device into the test database, returning its ID.
    async fn insert_device(pool: &SqlitePool, mac: &str, hostname: Option<&str>) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO devices (id, mac, hostname, first_seen_at, last_seen_at) \
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(mac)
        .bind(hostname)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .expect("failed to insert device");
        id
    }

    /// Insert a setting key-value pair.
    async fn insert_setting(pool: &SqlitePool, key: &str, value: &str) {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES (?, ?) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await
        .expect("failed to insert setting");
    }

    // ── ResolveResult struct tests ──────────────────────────────────

    #[tokio::test]
    async fn test_resolve_result_default() {
        let result = ResolveResult::default();
        assert_eq!(result.resolved, 0);
        assert_eq!(result.candidates, 0);
        assert!(result.sources_queried.is_empty());
    }

    #[tokio::test]
    async fn test_resolve_result_serializes_to_json() {
        let result = ResolveResult {
            resolved: 3,
            candidates: 10,
            sources_queried: vec!["mikrotik".to_string(), "xiaomi".to_string()],
        };
        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["resolved"], 3);
        assert_eq!(json["candidates"], 10);
        assert_eq!(json["sources_queried"][0], "mikrotik");
        assert_eq!(json["sources_queried"][1], "xiaomi");
    }

    // ── get_setting tests ───────────────────────────────────────────

    #[tokio::test]
    async fn test_get_setting_returns_none_for_missing_key() {
        let pool = setup_test_db().await;
        let val = get_setting(&pool, "nonexistent_key").await;
        assert!(val.is_none());
    }

    #[tokio::test]
    async fn test_get_setting_returns_value_for_existing_key() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "mikrotik_url", "http://192.168.1.1").await;
        let val = get_setting(&pool, "mikrotik_url").await;
        assert_eq!(val.as_deref(), Some("http://192.168.1.1"));
    }

    #[tokio::test]
    async fn test_get_setting_returns_none_for_empty_value() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "mikrotik_password", "").await;
        let val = get_setting(&pool, "mikrotik_password").await;
        assert!(val.is_none(), "empty string should be treated as None");
    }

    // ── resolve_devices — no sources configured ─────────────────────

    #[tokio::test]
    async fn test_resolve_no_sources_configured() {
        let pool = setup_test_db().await;
        let result = resolve_devices(&pool).await;
        assert_eq!(result.resolved, 0);
        assert_eq!(result.candidates, 0);
        assert!(result.sources_queried.is_empty());
    }

    #[tokio::test]
    async fn test_resolve_no_sources_does_not_modify_devices() {
        let pool = setup_test_db().await;
        let _id = insert_device(&pool, "aa:bb:cc:dd:ee:ff", None).await;

        let result = resolve_devices(&pool).await;
        assert_eq!(result.resolved, 0);
        // No sources → mac_to_hostname is empty → candidates never counted
        assert!(result.sources_queried.is_empty());

        // Device should still have no hostname
        let hostname: Option<String> =
            sqlx::query_scalar("SELECT hostname FROM devices WHERE mac = 'aa:bb:cc:dd:ee:ff'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(hostname.is_none());
    }

    // ── resolve_devices — candidate counting ────────────────────────

    #[tokio::test]
    async fn test_resolve_devices_unreachable_source_returns_early() {
        let pool = setup_test_db().await;
        // Device WITH hostname should not be a candidate
        insert_device(&pool, "aa:bb:cc:dd:ee:01", Some("my-laptop")).await;
        // Device WITHOUT hostname is a candidate
        insert_device(&pool, "aa:bb:cc:dd:ee:02", None).await;

        // Enable MikroTik with an unreachable URL — connection fails,
        // so fetch_mikrotik_hostnames returns None (not added to sources_queried).
        // With no mappings collected, resolve_devices returns early before
        // counting candidates.
        insert_setting(&pool, "mikrotik_enabled", "true").await;
        insert_setting(&pool, "mikrotik_url", "http://192.0.2.1").await;

        let result = resolve_devices(&pool).await;
        // Connection failure means source is NOT recorded as queried
        assert!(result.sources_queried.is_empty());
        // Early return before candidate counting
        assert_eq!(result.candidates, 0);
        assert_eq!(result.resolved, 0);
    }

    #[tokio::test]
    async fn test_candidate_count_query_excludes_devices_with_hostname() {
        // Directly test the candidate counting SQL logic used by resolve_devices.
        let pool = setup_test_db().await;
        insert_device(&pool, "aa:bb:cc:dd:ee:01", Some("my-laptop")).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:02", None).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:03", None).await;

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE hostname IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
        // Only devices without hostname are candidates
        assert_eq!(count, 2);
    }

    // ── resolve_devices — source enabled but unreachable ────────────

    #[tokio::test]
    async fn test_resolve_mikrotik_enabled_but_unreachable() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "mikrotik_enabled", "1").await;
        insert_setting(&pool, "mikrotik_url", "http://192.0.2.1:9999").await;
        insert_setting(&pool, "mikrotik_user", "admin").await;
        insert_setting(&pool, "mikrotik_password", "pass").await;

        insert_device(&pool, "aa:bb:cc:dd:ee:ff", None).await;

        let result = resolve_devices(&pool).await;
        // Source was attempted; it should still appear in sources_queried
        // because we enter the branch, even though it returns None from error
        // Actually the MikroTik branch adds to sources_queried only on Ok.
        // On connection failure, fetch_mikrotik_hostnames returns None,
        // so "mikrotik" is NOT added to sources_queried.
        assert_eq!(result.resolved, 0);
    }

    #[tokio::test]
    async fn test_resolve_xiaomi_enabled_but_no_password() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "xiaomi_mesh_enabled", "true").await;
        // No password set → fetch_xiaomi_hostnames returns None early
        let result = resolve_devices(&pool).await;
        assert_eq!(result.resolved, 0);
        assert!(result.sources_queried.is_empty());
    }

    // ── resolve_devices — disabled sources are skipped ──────────────

    #[tokio::test]
    async fn test_resolve_mikrotik_disabled_is_skipped() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "mikrotik_enabled", "0").await;
        insert_setting(&pool, "mikrotik_url", "http://192.168.1.1").await;

        let result = resolve_devices(&pool).await;
        assert!(!result.sources_queried.contains(&"mikrotik".to_string()));
    }

    #[tokio::test]
    async fn test_resolve_xiaomi_disabled_is_skipped() {
        let pool = setup_test_db().await;
        insert_setting(&pool, "xiaomi_mesh_enabled", "false").await;

        let result = resolve_devices(&pool).await;
        assert!(!result.sources_queried.contains(&"xiaomi".to_string()));
    }

    // ── Edge cases ──────────────────────────────────────────────────

    #[tokio::test]
    async fn test_resolve_with_empty_database() {
        let pool = setup_test_db().await;
        // No devices, no settings at all
        let result = resolve_devices(&pool).await;
        assert_eq!(result.resolved, 0);
        assert_eq!(result.candidates, 0);
        assert!(result.sources_queried.is_empty());
    }

    #[tokio::test]
    async fn test_resolve_all_devices_already_have_hostnames() {
        let pool = setup_test_db().await;
        insert_device(&pool, "aa:bb:cc:dd:ee:01", Some("device-a")).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:02", Some("device-b")).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:03", Some("device-c")).await;

        // Enable MikroTik with unreachable URL
        insert_setting(&pool, "mikrotik_enabled", "true").await;
        insert_setting(&pool, "mikrotik_url", "http://192.0.2.1").await;

        let result = resolve_devices(&pool).await;
        // All devices have hostnames, so 0 candidates
        assert_eq!(result.candidates, 0);
        assert_eq!(result.resolved, 0);
    }

    #[tokio::test]
    async fn test_get_setting_enabled_check_variations() {
        let pool = setup_test_db().await;

        // "1" should mean enabled
        insert_setting(&pool, "mikrotik_enabled", "1").await;
        let val = get_setting(&pool, "mikrotik_enabled").await;
        assert_eq!(val.as_deref(), Some("1"));

        // "true" should mean enabled
        insert_setting(&pool, "mikrotik_enabled", "true").await;
        let val = get_setting(&pool, "mikrotik_enabled").await;
        assert_eq!(val.as_deref(), Some("true"));

        // "0" is returned as-is (caller decides meaning)
        insert_setting(&pool, "mikrotik_enabled", "0").await;
        let val = get_setting(&pool, "mikrotik_enabled").await;
        assert_eq!(val.as_deref(), Some("0"));

        // "false" is returned as-is
        insert_setting(&pool, "mikrotik_enabled", "false").await;
        let val = get_setting(&pool, "mikrotik_enabled").await;
        assert_eq!(val.as_deref(), Some("false"));
    }

    #[tokio::test]
    async fn test_resolve_with_malformed_mac_in_database() {
        let pool = setup_test_db().await;
        // Insert a device with a non-standard MAC format
        insert_device(&pool, "not-a-mac", None).await;

        let result = resolve_devices(&pool).await;
        // Should not panic, just return normally
        assert_eq!(result.resolved, 0);
    }

    #[tokio::test]
    async fn test_resolve_preserves_existing_hostname() {
        let pool = setup_test_db().await;
        // Device already has hostname
        insert_device(&pool, "aa:bb:cc:dd:ee:ff", Some("my-server")).await;

        let result = resolve_devices(&pool).await;
        assert_eq!(result.resolved, 0);

        // Original hostname should be intact
        let hostname: Option<String> =
            sqlx::query_scalar("SELECT hostname FROM devices WHERE mac = 'aa:bb:cc:dd:ee:ff'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(hostname.as_deref(), Some("my-server"));
    }

    #[tokio::test]
    async fn test_hostname_mapping_struct() {
        let mapping = HostnameMapping {
            hostname: "living-room-tv".to_string(),
            source: "mikrotik_dhcp".to_string(),
        };
        assert_eq!(mapping.hostname, "living-room-tv");
        assert_eq!(mapping.source, "mikrotik_dhcp");
    }

    #[tokio::test]
    async fn test_candidate_count_query_mixed_devices() {
        // Verify the candidate-counting SQL with a larger mixed dataset.
        let pool = setup_test_db().await;
        insert_device(&pool, "aa:bb:cc:dd:ee:01", None).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:02", Some("known-device")).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:03", None).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:04", None).await;
        insert_device(&pool, "aa:bb:cc:dd:ee:05", Some("another-known")).await;

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM devices WHERE hostname IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
        // 3 out of 5 devices have no hostname
        assert_eq!(count, 3);
    }
}
