//! DHCP hostname enrichment — reads DHCP lease hostnames and populates device records.
//!
//! Periodically queries the VyOS DHCP leases API and updates devices that have
//! no hostname with the hostname from their DHCP lease.

use sqlx::SqlitePool;
use tracing::{debug, info, warn};

use crate::config::AppConfig;

/// DHCP lease entry as returned by the VyOS API proxy.
#[derive(Debug, serde::Deserialize)]
struct DhcpLease {
    ip: String,
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
                .text("data", serde_json::json!({"op": "showConfig", "path": []}).to_string())
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
                    serde_json::json!({"op": "show", "path": ["dhcp", "server", "leases"]}).to_string(),
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
            debug!(
                "DHCP enrichment: VyOS returned status {}",
                resp.status()
            );
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
                                ip: ip.clone(),
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
                leases.push(DhcpLease { ip, mac, hostname });
            }
        }
    }

    leases
}

/// Start the periodic DHCP hostname enrichment task.
///
/// Runs every 5 minutes to pick up new DHCP leases and populate hostnames.
pub fn start_dhcp_enrichment_task(pool: SqlitePool, config: AppConfig) {
    if config.vyos.url.is_none() || config.vyos.api_key.is_none() {
        info!("DHCP enrichment disabled (VyOS not configured)");
        return;
    }

    info!("Starting DHCP hostname enrichment (every 5 min)");
    tokio::spawn(async move {
        // Initial delay to let the server start up.
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            enrich_from_dhcp_leases(&pool, &config).await;
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
        let json = r#"{"data":{"LAN":{"10.10.0.100":{"mac":"aa:bb:cc:dd:ee:01","hostname":"mypc"}}}}"#;
        let leases = parse_dhcp_leases(json);
        assert_eq!(leases.len(), 1);
        assert_eq!(leases[0].ip, "10.10.0.100");
        assert_eq!(leases[0].mac, "aa:bb:cc:dd:ee:01");
        assert_eq!(leases[0].hostname.as_deref(), Some("mypc"));
    }
}
