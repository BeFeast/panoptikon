use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use super::AppState;

// ── Parsed VyOS route ───────────────────────────────────

/// A single parsed VyOS route from `show ip route` output.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VyosRoute {
    /// Protocol code: C, L, S, K, O, B, R, etc.
    pub protocol: String,
    /// Destination CIDR (e.g. "0.0.0.0/0", "10.10.0.0/24")
    pub destination: String,
    /// Next-hop gateway IP (None for directly connected)
    pub gateway: Option<String>,
    /// Outgoing interface (e.g. "eth0")
    pub interface: Option<String>,
    /// Metric string from [admin/metric] bracket (e.g. "1/0")
    pub metric: Option<String>,
    /// Uptime / age of the route (e.g. "01:23:45", "15:03:56")
    pub uptime: Option<String>,
    /// Whether this is a selected/best route (indicated by '>' and/or '*')
    pub selected: bool,
}

/// Parse the text output of `show ip route` into a vec of [`VyosRoute`].
///
/// Expected route line formats:
/// ```text
/// S>* 0.0.0.0/0 [1/0] via 10.10.0.1, eth0, weight 1, 15:01:21
/// C>* 10.10.0.0/24 is directly connected, eth0, weight 1, 15:03:56
/// L>* 10.10.0.50/32 is directly connected, eth0, weight 1, 15:03:56
/// K>* 0.0.0.0/0 [0/0] via 192.168.1.1, eth0, 00:05:00
/// O   10.0.0.0/8 [110/20] via 10.10.0.2, eth1, weight 1, 02:00:00
/// O>* 10.0.0.0/8 [110/20] via 10.10.0.2, eth1, weight 1, 02:00:00
/// B>  172.16.0.0/12 [20/0] via 10.10.0.3, eth0, weight 1, 1d00h00m
/// ```
pub fn parse_routes_text(text: &str) -> Vec<VyosRoute> {
    let mut routes = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();

        // Skip empty lines, header/legend lines, separator lines
        if trimmed.is_empty()
            || trimmed.starts_with("Codes:")
            || trimmed.starts_with("IPv")
            || trimmed.starts_with('>')
            || trimmed.starts_with('*')
            || trimmed.starts_with("---")
        {
            continue;
        }

        // Continuation lines from the legend block (start with spaces and contain descriptive text)
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }

        // Route lines start with a letter code (protocol)
        let first_char = match trimmed.chars().next() {
            Some(c) if c.is_ascii_alphabetic() => c,
            _ => continue,
        };

        // Extract protocol code (first letter or letters before '>' or '*' or ' ')
        // Common: single letter like S, C, L, K, O, B, R, etc.
        let protocol = first_char.to_string();

        // Determine if selected: look for '>' and/or '*' after protocol
        let rest_after_proto = &trimmed[1..];
        let selected = rest_after_proto.starts_with(">*")
            || rest_after_proto.starts_with('>')
            || rest_after_proto.starts_with("*>");

        // Find the destination: first CIDR-like token (x.x.x.x/n)
        let parts: Vec<&str> = trimmed.split_whitespace().collect();

        // The destination is typically the second token (after "S>*" etc.)
        // but the first token may be "S>*" or "S" or "S>" etc.
        let dest_idx = if parts.len() > 1 && parts[1].contains('/') {
            1
        } else if parts.len() > 2 && parts[2].contains('/') {
            2
        } else {
            continue;
        };

        let destination = parts[dest_idx].to_string();

        // Extract metric from [admin/metric] bracket
        let metric = parts.iter().find_map(|p| {
            if p.starts_with('[') && p.ends_with(']') {
                Some(p.trim_start_matches('[').trim_end_matches(']').to_string())
            } else {
                None
            }
        });

        // Check if "via" is present → gateway route
        let via_pos = parts.iter().position(|p| *p == "via");
        let gateway = via_pos
            .and_then(|i| parts.get(i + 1))
            .map(|g| g.trim_end_matches(',').to_string());

        // Check if "directly connected" → no gateway, extract interface after comma
        let is_connected = trimmed.contains("is directly connected");

        // Extract interface: it's the token after "via <ip>," or after "is directly connected,"
        let interface = if let Some(via_i) = via_pos {
            // Interface is typically 2 positions after "via": "via 10.10.0.1, eth0,"
            parts
                .get(via_i + 2)
                .map(|s| s.trim_end_matches(',').to_string())
        } else if is_connected {
            // Find "connected," and the next token is the interface
            parts
                .iter()
                .position(|p| p.trim_end_matches(',') == "connected")
                .and_then(|i| parts.get(i + 1))
                .map(|s| s.trim_end_matches(',').to_string())
        } else {
            None
        };

        // Extract uptime: the last token that looks like a time (HH:MM:SS or NdNNhNNm)
        let uptime = parts.last().and_then(|last| {
            let s = last.trim_end_matches(',');
            // Match patterns like "15:01:21", "1d00h00m", "00:05:00"
            if s.contains(':')
                && s.chars().any(|c| c.is_ascii_digit())
                && !s.contains('/')
                && !s.contains('.')
                && !s.starts_with('[')
            {
                Some(s.to_string())
            } else {
                None
            }
        });

        routes.push(VyosRoute {
            protocol,
            destination,
            gateway,
            interface,
            metric,
            uptime,
            selected,
        });
    }

    routes
}

// ── Parsed VyOS interface ───────────────────────────────

/// A single parsed VyOS network interface from `show interfaces` output.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VyosInterface {
    pub name: String,
    pub ip_address: Option<String>,
    pub mac: Option<String>,
    pub vrf: Option<String>,
    pub mtu: u32,
    pub admin_state: String,
    pub link_state: String,
    pub description: Option<String>,
}

/// Parse the text output of `show interfaces` into a vec of [`VyosInterface`].
///
/// Expected format (after header):
/// ```text
/// Interface    IP Address     MAC                VRF        MTU  S/L    Description
/// -----------  -------------  -----------------  -------  -----  -----  -------------
/// eth0         10.10.0.50/24  bc:24:11:12:9f:fa  default   1500  u/u
/// lo           127.0.0.1/8    00:00:00:00:00:00  default  65536  u/u
///              ::1/128
/// ```
pub fn parse_interfaces_text(text: &str) -> Vec<VyosInterface> {
    let mut interfaces = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();

        // Skip empty lines, header descriptions, and separator lines
        if trimmed.is_empty()
            || trimmed.starts_with("Codes:")
            || trimmed.starts_with("Interface")
            || trimmed.starts_with("---")
        {
            continue;
        }

        // Continuation lines (start with whitespace, contain only an IP like ::1/128)
        // These are additional IPs for the previous interface — skip for now
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }

        // Parse a main interface line
        // Fields are whitespace-separated: Name  IP  MAC  VRF  MTU  S/L  [Description]
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 6 {
            continue;
        }

        let name = parts[0].to_string();
        let ip_raw = parts[1];
        let mac_raw = parts[2];
        let vrf_raw = parts[3];
        // MTU might not parse if the line is malformed
        let mtu = match parts[4].parse::<u32>() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let state_field = parts[5]; // e.g. "u/u", "D/D", "A/D"

        // Parse admin/link state from S/L field
        let (admin_state, link_state) = parse_state_field(state_field);

        // IP: "-" means no address
        let ip_address = if ip_raw == "-" {
            None
        } else {
            Some(ip_raw.to_string())
        };

        // MAC: "-" or all zeros for loopback
        let mac = if mac_raw == "-" {
            None
        } else {
            Some(mac_raw.to_string())
        };

        // VRF: "-" means no VRF
        let vrf = if vrf_raw == "-" {
            None
        } else {
            Some(vrf_raw.to_string())
        };

        // Description: everything after the 6th field
        let description = if parts.len() > 6 {
            Some(parts[6..].join(" "))
        } else {
            None
        };

        interfaces.push(VyosInterface {
            name,
            ip_address,
            mac,
            vrf,
            mtu,
            admin_state,
            link_state,
            description,
        });
    }

    interfaces
}

/// Parse the S/L state field (e.g. "u/u", "D/D", "A/D") into (admin_state, link_state).
fn parse_state_field(field: &str) -> (String, String) {
    let parts: Vec<&str> = field.split('/').collect();
    if parts.len() != 2 {
        return ("unknown".to_string(), "unknown".to_string());
    }

    let admin = match parts[0] {
        "u" => "up",
        "D" => "down",
        "A" => "admin-down",
        other => other,
    };

    let link = match parts[1] {
        "u" => "up",
        "D" => "down",
        other => other,
    };

    (admin.to_string(), link.to_string())
}

/// Status response for the router.
#[derive(Debug, Serialize)]
pub struct RouterStatus {
    pub configured: bool,
    pub reachable: bool,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub hostname: Option<String>,
}

/// GET /api/v1/vyos/status — check if VyOS is configured and reachable.
pub async fn status(State(state): State<AppState>) -> Json<RouterStatus> {
    let client = match get_vyos_client_from_db(&state.db, &state.config).await {
        Some(c) => c,
        None => {
            return Json(RouterStatus {
                configured: false,
                reachable: false,
                version: None,
                uptime: None,
                hostname: None,
            });
        }
    };

    // Try to fetch version and uptime
    let version = client.show(&["version"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            // Extract "Version: VyOS xxx" line
            s.lines()
                .find(|l| l.starts_with("Version:"))
                .map(|l| l.trim_start_matches("Version:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let uptime = client.show(&["system", "uptime"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            s.lines()
                .find(|l| l.starts_with("Uptime:"))
                .map(|l| l.trim_start_matches("Uptime:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let hostname = client
        .show(&["host", "name"])
        .await
        .ok()
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()));

    let reachable = version.is_some() || uptime.is_some();

    Json(RouterStatus {
        configured: true,
        reachable,
        version,
        uptime,
        hostname,
    })
}

/// GET /api/v1/vyos/interfaces — fetch VyOS interface information (parsed).
///
/// Calls `show interfaces` on VyOS, parses the tabular text output, and returns
/// a JSON array of [`VyosInterface`] objects.
pub async fn interfaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<VyosInterface>>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    let raw_value = client.show(&["interfaces"]).await.map_err(|e| {
        tracing::error!("VyOS interfaces query failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let text = raw_value.as_str().unwrap_or("");
    let parsed = parse_interfaces_text(text);
    Ok(Json(parsed))
}

/// GET /api/v1/vyos/routes — fetch VyOS routing table (parsed).
///
/// Calls `show ip route` on VyOS, parses the text output, and returns
/// a JSON array of [`VyosRoute`] objects.
pub async fn routes(State(state): State<AppState>) -> Result<Json<Vec<VyosRoute>>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    let raw_value = client.show(&["ip", "route"]).await.map_err(|e| {
        tracing::error!("VyOS routes query failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let text = raw_value.as_str().unwrap_or("");
    let parsed = parse_routes_text(text);
    Ok(Json(parsed))
}

/// GET /api/v1/vyos/dhcp-leases — fetch DHCP server leases from VyOS.
pub async fn dhcp_leases(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .show(&["dhcp", "server", "leases"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS DHCP leases query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

/// GET /api/v1/vyos/firewall — fetch firewall config from VyOS.
pub async fn firewall(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    // Firewall may not be configured — that's OK, return empty object
    match client.retrieve(&["firewall"]).await {
        Ok(data) => Ok(Json(data)),
        Err(e) => {
            let msg = e.to_string();
            // VyOS returns error when path is empty (no firewall configured)
            if msg.contains("empty") || msg.contains("does not exist") {
                Ok(Json(serde_json::json!({})))
            } else {
                tracing::error!("VyOS firewall query failed: {e}");
                Err(StatusCode::BAD_GATEWAY)
            }
        }
    }
}

/// GET /api/v1/vyos/config-interfaces — fetch interface configuration (structured).
pub async fn config_interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .retrieve(&["interfaces"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS config-interfaces query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

// ── Speed Test ──────────────────────────────────────────────────────

/// Speed test result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub tested_at: DateTime<Utc>,
}

/// Error response for the speed test endpoint.
#[derive(Debug, Serialize)]
pub struct SpeedTestError {
    pub error: String,
}

/// Parsed iperf3 end-of-test summary.
#[derive(Debug, Deserialize)]
struct Iperf3End {
    sum_received: Option<Iperf3Sum>,
}

#[derive(Debug, Deserialize)]
struct Iperf3Sum {
    bits_per_second: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct Iperf3Result {
    end: Option<Iperf3End>,
}

/// Parse iperf3 JSON output and extract bits_per_second from sum_received.
pub fn parse_iperf3_bps(json_str: &str) -> Result<f64, String> {
    let parsed: Iperf3Result =
        serde_json::from_str(json_str).map_err(|e| format!("failed to parse iperf3 JSON: {e}"))?;

    let end = parsed
        .end
        .ok_or_else(|| "iperf3 JSON missing 'end' field".to_string())?;

    let sum = end
        .sum_received
        .ok_or_else(|| "iperf3 JSON missing 'end.sum_received' field".to_string())?;

    sum.bits_per_second
        .ok_or_else(|| "iperf3 JSON missing 'end.sum_received.bits_per_second' field".to_string())
}

const SPEEDTEST_RATE_LIMIT_SECS: i64 = 60;

/// POST /api/v1/router/speedtest — run a WAN speed test using iperf3 against public servers.
///
/// Does **not** require VyOS to be configured. Runs iperf3 locally on the
/// Panoptikon server to measure internet throughput.
pub async fn speedtest(
    State(state): State<AppState>,
) -> Result<Json<SpeedTestResult>, (StatusCode, Json<SpeedTestError>)> {
    // Rate limit: check if last test was less than 60 seconds ago
    {
        let last = state.last_speedtest.lock().await;
        if let Some(ref result) = *last {
            let elapsed = Utc::now()
                .signed_duration_since(result.tested_at)
                .num_seconds();
            if elapsed < SPEEDTEST_RATE_LIMIT_SECS {
                return Err((
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(SpeedTestError {
                        error: format!(
                            "Rate limited. Please wait {}s before running another test.",
                            SPEEDTEST_RATE_LIMIT_SECS - elapsed
                        ),
                    }),
                ));
            }
        }
    }

    // Check iperf3 is installed locally
    let iperf3_check = tokio::process::Command::new("iperf3")
        .arg("--version")
        .output()
        .await;

    if iperf3_check.is_err() || !iperf3_check.unwrap().status.success() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(SpeedTestError {
                error: "iperf3 not installed on server".to_string(),
            }),
        ));
    }

    tracing::info!("Starting WAN speed test via public iperf3 servers");

    // --- Download test (--reverse: server sends to us) ---
    let (download_json, server_name) =
        crate::vyos::iperf3::run_iperf3_local(true)
            .await
            .map_err(|e| {
                tracing::error!("iperf3 download test failed: {e}");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(SpeedTestError {
                        error: format!("Download test failed: {e}"),
                    }),
                )
            })?;

    let download_mbps = match parse_iperf3_bps(&download_json) {
        Ok(bps) => bps / 1_000_000.0,
        Err(e) => {
            tracing::error!("Failed to parse download iperf3 result: {e}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SpeedTestError {
                    error: format!("Failed to parse iperf3 download result: {e}"),
                }),
            ));
        }
    };

    // --- Upload test (no --reverse: we send to server) ---
    let upload_mbps = match crate::vyos::iperf3::run_iperf3_local(false).await {
        Ok((upload_json, _)) => match parse_iperf3_bps(&upload_json) {
            Ok(bps) => bps / 1_000_000.0,
            Err(e) => {
                tracing::error!("Failed to parse upload iperf3 result: {e}");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(SpeedTestError {
                        error: format!("Failed to parse iperf3 upload result: {e}"),
                    }),
                ));
            }
        },
        Err(e) => {
            tracing::error!("iperf3 upload test failed: {e}");
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(SpeedTestError {
                    error: format!("Upload test failed: {e}"),
                }),
            ));
        }
    };

    // iperf3 doesn't provide latency; could ping separately
    let latency_ms = 0.0;

    let result = SpeedTestResult {
        download_mbps: (download_mbps * 100.0).round() / 100.0,
        upload_mbps: (upload_mbps * 100.0).round() / 100.0,
        latency_ms,
        tested_at: Utc::now(),
    };

    // Cache the result
    {
        let mut last = state.last_speedtest.lock().await;
        *last = Some(result.clone());
    }

    tracing::info!(
        "WAN speed test complete via {server_name}: download={:.2} Mbps, upload={:.2} Mbps",
        result.download_mbps,
        result.upload_mbps
    );

    Ok(Json(result))
}

// ── Helpers ─────────────────────────────────────────────────────────

/// Read VyOS URL and API key from the settings table, falling back to config file values.
async fn get_vyos_settings(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> (Option<String>, Option<String>) {
    let db_url: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_url'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    let db_key: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_api_key'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    // DB values take priority, fall back to config file
    let url = db_url
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.url.clone());
    let key = db_key
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.api_key.clone());

    (url, key)
}

/// Try to construct a VyOS client from DB settings + config. Returns None if not configured.
async fn get_vyos_client_from_db(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> Option<crate::vyos::client::VyosClient> {
    let (url, key) = get_vyos_settings(db, config).await;
    match (url, key) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => {
            Some(crate::vyos::client::VyosClient::new(&u, &k))
        }
        _ => None,
    }
}

/// Get VyOS client or return 503 SERVICE_UNAVAILABLE if not configured.
async fn get_vyos_client_or_503(
    state: &AppState,
) -> Result<crate::vyos::client::VyosClient, StatusCode> {
    get_vyos_client_from_db(&state.db, &state.config)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// A realistic iperf3 JSON output for testing.
    const IPERF3_SAMPLE_JSON: &str = r#"{
        "start": {
            "connecting_to": {
                "host": "10.10.0.14",
                "port": 5201
            },
            "version": "iperf 3.6",
            "timestamp": {
                "time": "Fri, 21 Feb 2026 00:00:00 GMT",
                "timesecs": 1771545600
            }
        },
        "intervals": [],
        "end": {
            "sum_sent": {
                "start": 0,
                "end": 5.000050,
                "seconds": 5.000050,
                "bytes": 587202560,
                "bits_per_second": 939513379.456,
                "retransmits": 0,
                "sender": true
            },
            "sum_received": {
                "start": 0,
                "end": 5.000050,
                "seconds": 5.000050,
                "bytes": 585105408,
                "bits_per_second": 936157654.123,
                "retransmits": 0,
                "sender": false
            }
        }
    }"#;

    #[test]
    fn test_parse_route_static() {
        let text = "S>* 0.0.0.0/0 [1/0] via 10.10.0.1, eth0, 01:23:45";
        let routes = parse_routes_text(text);
        assert_eq!(routes.len(), 1);
        let r = &routes[0];
        assert_eq!(r.protocol, "S");
        assert_eq!(r.destination, "0.0.0.0/0");
        assert_eq!(r.gateway.as_deref(), Some("10.10.0.1"));
        assert_eq!(r.interface.as_deref(), Some("eth0"));
        assert_eq!(r.metric.as_deref(), Some("1/0"));
        assert_eq!(r.uptime.as_deref(), Some("01:23:45"));
        assert!(r.selected);
    }

    #[test]
    fn test_parse_route_connected() {
        let text = "C>* 10.10.0.0/24 is directly connected, eth0";
        let routes = parse_routes_text(text);
        assert_eq!(routes.len(), 1);
        let r = &routes[0];
        assert_eq!(r.protocol, "C");
        assert_eq!(r.destination, "10.10.0.0/24");
        assert!(r.gateway.is_none());
        assert_eq!(r.interface.as_deref(), Some("eth0"));
        assert!(r.selected);
    }

    #[test]
    fn test_parse_route_local() {
        let text = "L>* 10.10.0.50/32 is directly connected, eth0, weight 1, 15:03:56";
        let routes = parse_routes_text(text);
        assert_eq!(routes.len(), 1);
        let r = &routes[0];
        assert_eq!(r.protocol, "L");
        assert_eq!(r.destination, "10.10.0.50/32");
        assert!(r.gateway.is_none());
        assert_eq!(r.interface.as_deref(), Some("eth0"));
        assert_eq!(r.uptime.as_deref(), Some("15:03:56"));
        assert!(r.selected);
    }

    #[test]
    fn test_parse_routes_empty() {
        assert!(parse_routes_text("").is_empty());
        assert!(parse_routes_text("   \n\n  ").is_empty());
        assert!(parse_routes_text(
            "Codes: K - kernel route, C - connected, L - local, S - static,\n\
             IPv4 unicast VRF default:\n"
        )
        .is_empty());
    }

    #[test]
    fn test_parse_routes_full_output() {
        let text = "Codes: K - kernel route, C - connected, L - local, S - static,\n\
                    \x20      R - RIP, O - OSPF, I - IS-IS, B - BGP, E - EIGRP, N - NHRP,\n\
                    \x20      T - Table, v - VNC, V - VNC-Direct, A - Babel, F - PBR,\n\
                    \x20      f - OpenFabric, t - Table-Direct,\n\
                    \x20      > - selected route, * - FIB route, q - queued, r - rejected, b - backup\n\
                    \x20      t - trapped, o - offload failure\n\
                    \n\
                    IPv4 unicast VRF default:\n\
                    S>* 0.0.0.0/0 [1/0] via 10.10.0.1, eth0, weight 1, 15:01:21\n\
                    C>* 10.10.0.0/24 is directly connected, eth0, weight 1, 15:03:56\n\
                    L>* 10.10.0.50/32 is directly connected, eth0, weight 1, 15:03:56\n";

        let routes = parse_routes_text(text);
        assert_eq!(routes.len(), 3);

        assert_eq!(routes[0].protocol, "S");
        assert_eq!(routes[0].destination, "0.0.0.0/0");
        assert_eq!(routes[0].gateway.as_deref(), Some("10.10.0.1"));
        assert!(routes[0].selected);

        assert_eq!(routes[1].protocol, "C");
        assert_eq!(routes[1].destination, "10.10.0.0/24");
        assert!(routes[1].gateway.is_none());
        assert!(routes[1].selected);

        assert_eq!(routes[2].protocol, "L");
        assert_eq!(routes[2].destination, "10.10.0.50/32");
        assert!(routes[2].gateway.is_none());
        assert!(routes[2].selected);
    }

    #[test]
    fn test_parse_route_not_selected() {
        let text = "O   10.0.0.0/8 [110/20] via 10.10.0.2, eth1, weight 1, 02:00:00";
        let routes = parse_routes_text(text);
        assert_eq!(routes.len(), 1);
        let r = &routes[0];
        assert_eq!(r.protocol, "O");
        assert!(!r.selected);
        assert_eq!(r.metric.as_deref(), Some("110/20"));
    }

    #[test]
    fn test_parse_iperf3_json_result() {
        let bps = parse_iperf3_bps(IPERF3_SAMPLE_JSON).expect("should parse successfully");
        let mbps = bps / 1_000_000.0;
        // 936157654.123 / 1_000_000 ≈ 936.16
        assert!(
            (mbps - 936.16).abs() < 0.1,
            "expected ~936.16 Mbps, got {mbps}"
        );
    }

    #[test]
    fn test_parse_iperf3_missing_fields() {
        // Missing 'end' field entirely
        let no_end = r#"{"start": {}}"#;
        let err = parse_iperf3_bps(no_end).unwrap_err();
        assert!(
            err.contains("missing 'end' field"),
            "expected 'missing end' error, got: {err}"
        );

        // Missing 'sum_received'
        let no_sum = r#"{"end": {"sum_sent": {"bits_per_second": 100}}}"#;
        let err = parse_iperf3_bps(no_sum).unwrap_err();
        assert!(
            err.contains("missing 'end.sum_received' field"),
            "expected 'missing sum_received' error, got: {err}"
        );

        // Missing 'bits_per_second'
        let no_bps = r#"{"end": {"sum_received": {}}}"#;
        let err = parse_iperf3_bps(no_bps).unwrap_err();
        assert!(
            err.contains("missing 'end.sum_received.bits_per_second' field"),
            "expected 'missing bits_per_second' error, got: {err}"
        );

        // Invalid JSON
        let bad_json = "not json at all";
        let err = parse_iperf3_bps(bad_json).unwrap_err();
        assert!(
            err.contains("failed to parse"),
            "expected parse error, got: {err}"
        );
    }

    #[test]
    fn test_parse_interfaces_up() {
        let text = "Codes: S - State, L - Link, u - Up, D - Down, A - Admin Down\n\
            Interface    IP Address     MAC                VRF        MTU  S/L    Description\n\
            -----------  -------------  -----------------  -------  -----  -----  -------------\n\
            eth0         10.10.0.50/24  bc:24:11:12:9f:fa  default   1500  u/u\n\
            lo           127.0.0.1/8    00:00:00:00:00:00  default  65536  u/u\n\
                         ::1/128\n";

        let ifaces = parse_interfaces_text(text);
        assert_eq!(ifaces.len(), 2);

        let eth0 = &ifaces[0];
        assert_eq!(eth0.name, "eth0");
        assert_eq!(eth0.ip_address.as_deref(), Some("10.10.0.50/24"));
        assert_eq!(eth0.mac.as_deref(), Some("bc:24:11:12:9f:fa"));
        assert_eq!(eth0.mtu, 1500);
        assert_eq!(eth0.admin_state, "up");
        assert_eq!(eth0.link_state, "up");
        assert!(eth0.description.is_none());

        let lo = &ifaces[1];
        assert_eq!(lo.name, "lo");
        assert_eq!(lo.ip_address.as_deref(), Some("127.0.0.1/8"));
        assert_eq!(lo.mtu, 65536);
        assert_eq!(lo.admin_state, "up");
        assert_eq!(lo.link_state, "up");
    }

    #[test]
    fn test_parse_interfaces_down() {
        let text = "Codes: S - State, L - Link, u - Up, D - Down, A - Admin Down\n\
            Interface    IP Address     MAC                VRF        MTU  S/L    Description\n\
            -----------  -------------  -----------------  -------  -----  -----  -------------\n\
            eth1         -              aa:bb:cc:dd:ee:ff  -         1500  D/D    LAN port\n";

        let ifaces = parse_interfaces_text(text);
        assert_eq!(ifaces.len(), 1);

        let eth1 = &ifaces[0];
        assert_eq!(eth1.name, "eth1");
        assert!(eth1.ip_address.is_none());
        assert_eq!(eth1.mac.as_deref(), Some("aa:bb:cc:dd:ee:ff"));
        assert!(eth1.vrf.is_none());
        assert_eq!(eth1.mtu, 1500);
        assert_eq!(eth1.admin_state, "down");
        assert_eq!(eth1.link_state, "down");
        assert_eq!(eth1.description.as_deref(), Some("LAN port"));
    }

    #[test]
    fn test_parse_interfaces_admin_down() {
        let text = "Codes: S - State, L - Link, u - Up, D - Down, A - Admin Down\n\
            Interface    IP Address     MAC                VRF        MTU  S/L    Description\n\
            -----------  -------------  -----------------  -------  -----  -----  -------------\n\
            eth2         192.168.1.1/24 aa:bb:cc:dd:ee:00  default   1500  A/D    Management\n";

        let ifaces = parse_interfaces_text(text);
        assert_eq!(ifaces.len(), 1);

        let eth2 = &ifaces[0];
        assert_eq!(eth2.admin_state, "admin-down");
        assert_eq!(eth2.link_state, "down");
        assert_eq!(eth2.description.as_deref(), Some("Management"));
    }

    #[test]
    fn test_parse_interfaces_empty() {
        assert!(parse_interfaces_text("").is_empty());
        assert!(parse_interfaces_text("   \n\n  ").is_empty());
        assert!(parse_interfaces_text(
            "Codes: S - State, L - Link, u - Up, D - Down, A - Admin Down\n\
             Interface    IP Address     MAC                VRF        MTU  S/L    Description\n\
             -----------  -------------  -----------------  -------  -----  -----  -------------\n"
        )
        .is_empty());
    }

    #[test]
    fn test_parse_state_field() {
        assert_eq!(
            parse_state_field("u/u"),
            ("up".to_string(), "up".to_string())
        );
        assert_eq!(
            parse_state_field("D/D"),
            ("down".to_string(), "down".to_string())
        );
        assert_eq!(
            parse_state_field("A/D"),
            ("admin-down".to_string(), "down".to_string())
        );
        assert_eq!(
            parse_state_field("invalid"),
            ("unknown".to_string(), "unknown".to_string())
        );
    }

    #[tokio::test]
    async fn test_speedtest_rate_limit() {
        use std::sync::Arc;
        use tokio::sync::Mutex;

        // Create a cached result that was just done
        let recent_result = SpeedTestResult {
            download_mbps: 500.0,
            upload_mbps: 450.0,
            latency_ms: 0.5,
            tested_at: Utc::now(),
        };

        let last_speedtest: Arc<Mutex<Option<SpeedTestResult>>> =
            Arc::new(Mutex::new(Some(recent_result)));

        // Simulate rate-limit check
        {
            let last = last_speedtest.lock().await;
            if let Some(ref result) = *last {
                let elapsed = Utc::now()
                    .signed_duration_since(result.tested_at)
                    .num_seconds();
                assert!(
                    elapsed < SPEEDTEST_RATE_LIMIT_SECS,
                    "test should be within rate limit window"
                );
            }
        }

        // Test with an old result (> 60 seconds ago)
        let old_result = SpeedTestResult {
            download_mbps: 500.0,
            upload_mbps: 450.0,
            latency_ms: 0.5,
            tested_at: Utc::now() - chrono::Duration::seconds(120),
        };

        let last_speedtest_old: Arc<Mutex<Option<SpeedTestResult>>> =
            Arc::new(Mutex::new(Some(old_result)));

        {
            let last = last_speedtest_old.lock().await;
            if let Some(ref result) = *last {
                let elapsed = Utc::now()
                    .signed_duration_since(result.tested_at)
                    .num_seconds();
                assert!(
                    elapsed >= SPEEDTEST_RATE_LIMIT_SECS,
                    "old result should NOT be rate limited"
                );
            }
        }
    }
}
