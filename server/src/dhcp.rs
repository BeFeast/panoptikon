//! DHCP hostname enrichment — reads DHCP lease hostnames and populates device records.
//!
//! This module previously queried DHCP leases from the router and updated devices
//! that had no hostname. It is currently disabled because no supported router is
//! configured for DHCP lease queries. The parse logic is retained for future use
//! when router-agnostic DHCP enrichment is implemented.

use sqlx::SqlitePool;
use tracing::info;

use crate::config::AppConfig;

/// DHCP lease entry as returned by a router's DHCP API.
#[derive(Debug, serde::Deserialize)]
#[cfg_attr(not(test), allow(dead_code))]
struct DhcpLease {
    _ip: String,
    mac: String,
    hostname: Option<String>,
}

/// Run a single DHCP hostname enrichment pass.
///
/// Currently a no-op — no supported router is configured for DHCP lease queries.
pub async fn enrich_from_dhcp_leases(_pool: &SqlitePool, _config: &AppConfig) {
    info!("DHCP enrichment disabled (no supported router configured)");
}

/// Parse DHCP lease text output into structured entries.
///
/// Supports both JSON format and text table format.
/// Retained for future use when router-agnostic DHCP enrichment is added.
#[cfg_attr(not(test), allow(dead_code))]
fn parse_dhcp_leases(text: &str) -> Vec<DhcpLease> {
    let mut leases = Vec::new();

    // Try JSON parse first (some router versions return JSON).
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

/// Start the periodic DHCP hostname enrichment task.
///
/// Currently a no-op — no supported router is configured for DHCP lease queries.
pub fn start_dhcp_enrichment_task(_pool: SqlitePool, _config: AppConfig) {
    info!("DHCP enrichment disabled (no supported router configured)");
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
