use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
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

// ── Parsed VyOS DHCP lease ──────────────────────────────

/// A single parsed VyOS DHCP lease from `show dhcp server leases` output.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VyosDhcpLease {
    pub ip: String,
    pub mac: String,
    pub hostname: Option<String>,
    pub state: String,
    pub lease_start: Option<String>,
    pub lease_expiry: Option<String>,
    pub remaining: Option<String>,
    pub pool: Option<String>,
}

/// Parse the text output of `show dhcp server leases` into a vec of [`VyosDhcpLease`].
///
/// Expected format (header + data rows):
/// ```text
/// IP Address    MAC Address        State    Lease start          Lease expiration     Remaining  Pool       Hostname
/// -----------   -----------------  ------   -------------------  -------------------  ---------  ---------  --------
/// 10.10.0.100   aa:bb:cc:dd:ee:ff  active   2026/02/21 10:00:00  2026/02/21 22:00:00  11:30:00   LAN        myhost
/// 10.10.0.101   11:22:33:44:55:66  active   2026/02/21 09:00:00  2026/02/21 21:00:00  10:00:00   LAN        -
/// ```
///
/// Column order may vary across VyOS versions; we parse positionally based on headers.
/// If the output indicates DHCP is not configured, returns an empty vec.
pub fn parse_dhcp_leases_text(text: &str) -> Vec<VyosDhcpLease> {
    let mut leases = Vec::new();
    let text_lower = text.to_lowercase();

    // If DHCP is not configured, return empty
    if text_lower.contains("not configured")
        || text_lower.contains("no leases")
        || text.trim().is_empty()
    {
        return leases;
    }

    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return leases;
    }

    // Find the header line (contains "IP Address" or "IP address")
    let header_idx = lines.iter().position(|l| {
        let lower = l.to_lowercase();
        lower.contains("ip address") && lower.contains("mac")
    });

    let header_idx = match header_idx {
        Some(i) => i,
        None => return leases, // No recognizable header
    };

    // Parse column positions from header
    let header = lines[header_idx];
    let header_lower = header.to_lowercase();

    // Find column start positions
    let col_ip = header_lower.find("ip address").unwrap_or(0);
    let col_mac = header_lower.find("mac");
    let col_state = header_lower.find("state");
    let col_start = header_lower
        .find("lease start")
        .or_else(|| header_lower.find("start"));
    let col_expiry = header_lower
        .find("lease expiration")
        .or_else(|| header_lower.find("expir"));
    let col_remaining = header_lower.find("remaining");
    let col_pool = header_lower.find("pool");
    let col_hostname = header_lower.find("hostname");

    // Collect all column positions in order for boundary calculation
    let mut all_cols: Vec<(&str, usize)> = Vec::new();
    all_cols.push(("ip", col_ip));
    if let Some(c) = col_mac {
        all_cols.push(("mac", c));
    }
    if let Some(c) = col_state {
        all_cols.push(("state", c));
    }
    if let Some(c) = col_start {
        all_cols.push(("start", c));
    }
    if let Some(c) = col_expiry {
        all_cols.push(("expiry", c));
    }
    if let Some(c) = col_remaining {
        all_cols.push(("remaining", c));
    }
    if let Some(c) = col_pool {
        all_cols.push(("pool", c));
    }
    if let Some(c) = col_hostname {
        all_cols.push(("hostname", c));
    }
    all_cols.sort_by_key(|&(_, pos)| pos);

    // Helper: extract field value given its start position
    let extract_field = |line: &str, col_name: &str| -> Option<String> {
        let idx = all_cols.iter().position(|&(n, _)| n == col_name)?;
        let start = all_cols[idx].1;
        let end = all_cols
            .get(idx + 1)
            .map(|&(_, pos)| pos)
            .unwrap_or(line.len());

        if start >= line.len() {
            return None;
        }

        let end = end.min(line.len());
        let val = line.get(start..end)?.trim();
        if val.is_empty() || val == "-" {
            None
        } else {
            Some(val.to_string())
        }
    };

    // Skip header + separator line(s)
    let data_start = header_idx + 1;

    for line in &lines[data_start..] {
        let trimmed = line.trim();

        // Skip empty lines and separator lines
        if trimmed.is_empty() || trimmed.starts_with("---") || trimmed.starts_with("===") {
            continue;
        }

        // A data line should start with an IP-like pattern (digit)
        // But use column position instead for robustness
        let ip = match extract_field(line, "ip") {
            Some(ip) if ip.chars().next().is_some_and(|c| c.is_ascii_digit()) => ip,
            _ => continue,
        };

        let mac = extract_field(line, "mac").unwrap_or_default();
        if mac.is_empty() {
            continue; // Must have a MAC
        }

        let state = extract_field(line, "state").unwrap_or_else(|| "unknown".to_string());
        let lease_start = extract_field(line, "start");
        let lease_expiry = extract_field(line, "expiry");
        let remaining = extract_field(line, "remaining");
        let pool = extract_field(line, "pool");
        let hostname = extract_field(line, "hostname");

        leases.push(VyosDhcpLease {
            ip,
            mac,
            hostname,
            state,
            lease_start,
            lease_expiry,
            remaining,
            pool,
        });
    }

    leases
}

/// GET /api/v1/vyos/dhcp-leases — fetch DHCP server leases from VyOS (parsed).
///
/// Calls `show dhcp server leases` on VyOS, parses the tabular text output,
/// and returns a JSON array of [`VyosDhcpLease`] objects.
/// If DHCP is not configured, returns an empty array (not an error).
pub async fn dhcp_leases(
    State(state): State<AppState>,
) -> Result<Json<Vec<VyosDhcpLease>>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    let raw_value = client
        .show(&["dhcp", "server", "leases"])
        .await
        .map_err(|e| {
            tracing::error!("VyOS DHCP leases query failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    let text = raw_value.as_str().unwrap_or("");
    let parsed = parse_dhcp_leases_text(text);
    Ok(Json(parsed))
}

// ── Parsed VyOS Firewall Config ─────────────────────────

/// A single parsed firewall rule within a chain.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallRule {
    pub number: u32,
    pub action: String,
    pub source: Option<String>,
    pub destination: Option<String>,
    pub protocol: Option<String>,
    pub state: Option<String>,
    pub description: Option<String>,
}

/// A firewall chain (e.g. "IPv4 Forward Filter") with its rules.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallChain {
    pub name: String,
    pub default_action: String,
    pub rules: Vec<FirewallRule>,
}

/// Top-level firewall configuration containing all parsed chains.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallConfig {
    pub chains: Vec<FirewallChain>,
}

/// Format a source/destination object into a human-readable string.
///
/// VyOS source/destination can contain:
/// - `{"address": "10.0.0.0/8"}`
/// - `{"port": "443"}`
/// - `{"group": {"address-group": "LAN_HOSTS"}}`
/// - combinations of the above
fn format_endpoint(val: &Value) -> Option<String> {
    let obj = val.as_object()?;
    let mut parts = Vec::new();

    if let Some(addr) = obj.get("address").and_then(|v| v.as_str()) {
        parts.push(addr.to_string());
    }
    if let Some(network) = obj.get("network").and_then(|v| v.as_str()) {
        parts.push(network.to_string());
    }
    if let Some(group) = obj.get("group").and_then(|v| v.as_object()) {
        for (gtype, gname) in group {
            if let Some(name) = gname.as_str() {
                parts.push(format!("{gtype}: {name}"));
            }
        }
    }
    if let Some(port) = obj.get("port").and_then(|v| v.as_str()) {
        parts.push(format!("port {port}"));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(", "))
    }
}

/// Format a state object into a human-readable string.
///
/// VyOS state object: `{"established": "enable", "related": "enable", "new": "enable"}`
fn format_state(val: &Value) -> Option<String> {
    let obj = val.as_object()?;
    let enabled: Vec<&String> = obj
        .iter()
        .filter(|(_, v)| v.as_str() == Some("enable"))
        .map(|(k, _)| k)
        .collect();

    if enabled.is_empty() {
        None
    } else {
        Some(enabled.into_iter().cloned().collect::<Vec<_>>().join(", "))
    }
}

/// Parse VyOS firewall configuration JSON into a [`FirewallConfig`].
///
/// Expected structure:
/// ```json
/// {
///   "ipv4": {
///     "forward": { "filter": { "default-action": "drop", "rule": { "1": { ... } } } },
///     "input":   { "filter": { ... } },
///     "output":  { "filter": { ... } }
///   },
///   "ipv6": { ... }
/// }
/// ```
pub fn parse_firewall_config(value: &Value) -> FirewallConfig {
    let mut chains = Vec::new();

    let obj = match value.as_object() {
        Some(o) => o,
        None => return FirewallConfig { chains },
    };

    // Iterate IP versions: ipv4, ipv6
    for (ip_version, version_val) in obj {
        // Skip non-chain keys like "group"
        let version_obj = match version_val.as_object() {
            Some(o) => o,
            None => continue,
        };

        // Iterate directions: forward, input, output
        for (direction, direction_val) in version_obj {
            let direction_obj = match direction_val.as_object() {
                Some(o) => o,
                None => continue,
            };

            // Iterate filter types: filter, raw, etc.
            for (filter_type, filter_val) in direction_obj {
                let filter_obj = match filter_val.as_object() {
                    Some(o) => o,
                    None => continue,
                };

                let default_action = filter_obj
                    .get("default-action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("accept")
                    .to_string();

                let chain_name = format!(
                    "{} {} {}",
                    ip_version.to_uppercase(),
                    capitalize(direction),
                    capitalize(filter_type)
                );

                let mut rules = Vec::new();

                if let Some(rule_map) = filter_obj.get("rule").and_then(|v| v.as_object()) {
                    for (rule_num_str, rule_val) in rule_map {
                        let number = match rule_num_str.parse::<u32>() {
                            Ok(n) => n,
                            Err(_) => continue,
                        };

                        let rule_obj = match rule_val.as_object() {
                            Some(o) => o,
                            None => continue,
                        };

                        let action = rule_obj
                            .get("action")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string();

                        let source = rule_obj.get("source").and_then(format_endpoint);
                        let destination = rule_obj.get("destination").and_then(format_endpoint);

                        let protocol = rule_obj
                            .get("protocol")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        let state = rule_obj.get("state").and_then(format_state);

                        let description = rule_obj
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        rules.push(FirewallRule {
                            number,
                            action,
                            source,
                            destination,
                            protocol,
                            state,
                            description,
                        });
                    }
                }

                // Sort rules by number
                rules.sort_by_key(|r| r.number);

                chains.push(FirewallChain {
                    name: chain_name,
                    default_action,
                    rules,
                });
            }
        }
    }

    // Sort chains by name for consistent ordering
    chains.sort_by(|a, b| a.name.cmp(&b.name));

    FirewallConfig { chains }
}

/// Capitalize the first letter of a string.
fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// GET /api/v1/vyos/firewall — fetch firewall config from VyOS (parsed).
///
/// Calls `showConfig` for the `firewall` path on VyOS, parses the JSON config
/// into structured chains and rules, and returns a [`FirewallConfig`].
/// If no firewall is configured, returns an empty chains list.
pub async fn firewall(State(state): State<AppState>) -> Result<Json<FirewallConfig>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    // Firewall may not be configured — that's OK, return empty config
    match client.retrieve(&["firewall"]).await {
        Ok(data) => {
            let config = parse_firewall_config(&data);
            Ok(Json(config))
        }
        Err(e) => {
            let msg = e.to_string();
            // VyOS returns error when path is empty (no firewall configured)
            if msg.contains("empty") || msg.contains("does not exist") {
                Ok(Json(FirewallConfig { chains: Vec::new() }))
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

// ── Interface enable/disable ─────────────────────────────────────────────────

/// Request body for the interface toggle endpoint.
#[derive(Debug, Deserialize)]
pub struct InterfaceToggleRequest {
    /// `true` to disable the interface, `false` to enable it.
    pub disable: bool,
}

/// Response for write operations.
#[derive(Debug, Serialize)]
pub struct VyosWriteResponse {
    pub success: bool,
    pub message: String,
}

/// Derive the VyOS interface type prefix from the interface name.
///
/// e.g. "eth0" → "ethernet", "bond0" → "bonding", "br0" → "bridge", "lo" → "loopback"
fn interface_type(name: &str) -> Option<&'static str> {
    if name.starts_with("eth") {
        Some("ethernet")
    } else if name.starts_with("bond") {
        Some("bonding")
    } else if name.starts_with("br") {
        Some("bridge")
    } else if name.starts_with("wg") {
        Some("wireguard")
    } else if name == "lo" || name.starts_with("lo") {
        Some("loopback")
    } else if name.starts_with("vtun") {
        Some("openvpn")
    } else if name.starts_with("tun") {
        Some("tunnel")
    } else if name.starts_with("vti") {
        Some("vti")
    } else if name.starts_with("pppoe") {
        Some("pppoe")
    } else {
        None
    }
}

/// POST /api/v1/vyos/interfaces/:name/toggle — enable or disable a VyOS interface.
///
/// Sends `set interfaces <type> <name> disable` or
/// `delete interfaces <type> <name> disable` to VyOS.
pub async fn interface_toggle(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<InterfaceToggleRequest>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    let iface_type = interface_type(&name).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Cannot determine interface type for '{name}'"),
            }),
        )
    })?;

    let action = if body.disable { "disable" } else { "enable" };
    tracing::info!("VyOS: {action} interface {iface_type} {name}");

    let result = if body.disable {
        client
            .configure_set(&["interfaces", iface_type, &name, "disable"])
            .await
    } else {
        client
            .configure_delete(&["interfaces", iface_type, &name, "disable"])
            .await
    };

    match result {
        Ok(_) => Ok(Json(VyosWriteResponse {
            success: true,
            message: format!("Interface {name} {action}d successfully"),
        })),
        Err(e) => {
            tracing::error!("VyOS interface {action} failed for {name}: {e}");
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("VyOS error: {e}"),
                }),
            ))
        }
    }
}

// ── DHCP Static Mappings ────────────────────────────────────────────────────

/// A DHCP static mapping entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DhcpStaticMapping {
    /// The shared-network-name (e.g. "LAN")
    pub network: String,
    /// The subnet CIDR (e.g. "10.10.0.0/24")
    pub subnet: String,
    /// Mapping name / identifier
    pub name: String,
    /// MAC address
    pub mac: String,
    /// IP address assigned
    pub ip: String,
}

/// Request body for creating a DHCP static mapping.
#[derive(Debug, Deserialize)]
pub struct CreateDhcpStaticMappingRequest {
    /// The shared-network-name (e.g. "LAN")
    pub network: String,
    /// The subnet CIDR (e.g. "10.10.0.0/24")
    pub subnet: String,
    /// Mapping name / hostname identifier
    pub name: String,
    /// MAC address (XX:XX:XX:XX:XX:XX)
    pub mac: String,
    /// IP address to assign
    pub ip: String,
}

/// GET /api/v1/vyos/dhcp/static-mappings — list DHCP static mappings.
///
/// Reads VyOS config at `service dhcp-server` and parses static-mapping entries.
pub async fn dhcp_static_mappings(
    State(state): State<AppState>,
) -> Result<Json<Vec<DhcpStaticMapping>>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;

    let config = match client.retrieve(&["service", "dhcp-server"]).await {
        Ok(c) => c,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("empty") || msg.contains("does not exist") {
                return Ok(Json(Vec::new()));
            }
            tracing::error!("VyOS DHCP config query failed: {e}");
            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    let mappings = parse_dhcp_static_mappings(&config);
    Ok(Json(mappings))
}

/// Parse DHCP static mappings from VyOS DHCP server config JSON.
fn parse_dhcp_static_mappings(config: &Value) -> Vec<DhcpStaticMapping> {
    let mut mappings = Vec::new();

    let networks = match config
        .get("shared-network-name")
        .and_then(|v| v.as_object())
    {
        Some(n) => n,
        None => return mappings,
    };

    for (network_name, network_val) in networks {
        let subnets = match network_val.get("subnet").and_then(|v| v.as_object()) {
            Some(s) => s,
            None => continue,
        };

        for (subnet_cidr, subnet_val) in subnets {
            let statics = match subnet_val.get("static-mapping").and_then(|v| v.as_object()) {
                Some(s) => s,
                None => continue,
            };

            for (mapping_name, mapping_val) in statics {
                let mac = mapping_val
                    .get("mac-address")
                    // VyOS 1.3 uses "mac" instead of "mac-address"
                    .or_else(|| mapping_val.get("mac"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let ip = mapping_val
                    .get("ip-address")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !mac.is_empty() && !ip.is_empty() {
                    mappings.push(DhcpStaticMapping {
                        network: network_name.clone(),
                        subnet: subnet_cidr.clone(),
                        name: mapping_name.clone(),
                        mac,
                        ip,
                    });
                }
            }
        }
    }

    mappings.sort_by(|a, b| a.ip.cmp(&b.ip));
    mappings
}

/// POST /api/v1/vyos/dhcp/static-mappings — create a DHCP static mapping.
pub async fn create_dhcp_static_mapping(
    State(state): State<AppState>,
    Json(body): Json<CreateDhcpStaticMappingRequest>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    // Validate MAC address format
    if !is_valid_mac(&body.mac) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid MAC address format. Expected XX:XX:XX:XX:XX:XX".to_string(),
            }),
        ));
    }

    // Validate IP address format
    if body.ip.parse::<std::net::Ipv4Addr>().is_err() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid IP address format".to_string(),
            }),
        ));
    }

    // Validate name (alphanumeric, hyphens, underscores only)
    if body.name.is_empty()
        || !body
            .name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid mapping name. Use alphanumeric characters, hyphens, and underscores only.".to_string(),
            }),
        ));
    }

    let base_path = format!(
        "service dhcp-server shared-network-name {} subnet {} static-mapping {}",
        body.network, body.subnet, body.name
    );

    tracing::info!(
        "VyOS: creating DHCP static mapping {}: {} -> {} (network={}, subnet={})",
        body.name,
        body.mac,
        body.ip,
        body.network,
        body.subnet
    );

    // Set mac-address
    let mac_result = client
        .configure_set(&[
            "service",
            "dhcp-server",
            "shared-network-name",
            &body.network,
            "subnet",
            &body.subnet,
            "static-mapping",
            &body.name,
            "mac-address",
            &body.mac,
        ])
        .await;

    if let Err(e) = mac_result {
        tracing::error!("VyOS DHCP static-mapping mac set failed: {e}");
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Failed to set MAC address: {e}"),
            }),
        ));
    }

    // Set ip-address
    let ip_result = client
        .configure_set(&[
            "service",
            "dhcp-server",
            "shared-network-name",
            &body.network,
            "subnet",
            &body.subnet,
            "static-mapping",
            &body.name,
            "ip-address",
            &body.ip,
        ])
        .await;

    if let Err(e) = ip_result {
        tracing::error!("VyOS DHCP static-mapping ip set failed: {e}");
        // Try to clean up the mac we just set
        let _ = client
            .configure_delete(&[
                "service",
                "dhcp-server",
                "shared-network-name",
                &body.network,
                "subnet",
                &body.subnet,
                "static-mapping",
                &body.name,
            ])
            .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Failed to set IP address: {e}"),
            }),
        ));
    }

    tracing::info!(
        "VyOS: DHCP static mapping '{}' created ({base_path})",
        body.name
    );

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!(
            "Static mapping '{}' created: {} -> {}",
            body.name, body.mac, body.ip
        ),
    }))
}

/// Path parameters for deleting a DHCP static mapping.
#[derive(Debug, Deserialize)]
pub struct DhcpStaticMappingPath {
    pub network: String,
    pub subnet: String,
    pub name: String,
}

/// DELETE /api/v1/vyos/dhcp/static-mappings/:network/:subnet/:name — delete a DHCP static mapping.
pub async fn delete_dhcp_static_mapping(
    State(state): State<AppState>,
    Path(path): Path<DhcpStaticMappingPath>,
) -> Result<Json<VyosWriteResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "VyOS: deleting DHCP static mapping '{}' (network={}, subnet={})",
        path.name,
        path.network,
        path.subnet
    );

    let result = client
        .configure_delete(&[
            "service",
            "dhcp-server",
            "shared-network-name",
            &path.network,
            "subnet",
            &path.subnet,
            "static-mapping",
            &path.name,
        ])
        .await;

    match result {
        Ok(_) => Ok(Json(VyosWriteResponse {
            success: true,
            message: format!("Static mapping '{}' deleted", path.name),
        })),
        Err(e) => {
            tracing::error!("VyOS DHCP static-mapping delete failed: {e}");
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("VyOS error: {e}"),
                }),
            ))
        }
    }
}

/// Validate MAC address format (XX:XX:XX:XX:XX:XX, case-insensitive).
fn is_valid_mac(mac: &str) -> bool {
    let parts: Vec<&str> = mac.split(':').collect();
    parts.len() == 6
        && parts
            .iter()
            .all(|p| p.len() == 2 && p.chars().all(|c| c.is_ascii_hexdigit()))
}

// ── Speed Test ──────────────────────────────────────────────────────────────

/// Speed test result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub ping_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub isp: String,
    pub server: String,
    pub result_url: Option<String>,
    pub tested_at: DateTime<Utc>,
    pub error: Option<String>,
}

/// Error response for the speed test endpoint.
#[derive(Debug, Serialize)]
pub struct SpeedTestError {
    pub error: String,
}

const SPEEDTEST_RATE_LIMIT_SECS: i64 = 60;

/// POST /api/v1/router/speedtest — run a WAN speed test using Ookla Speedtest CLI.
///
/// Does **not** require VyOS to be configured. Runs the Ookla Speedtest CLI
/// locally on the Panoptikon server to measure internet throughput.
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

    // Check that Ookla Speedtest CLI is installed
    if tokio::fs::metadata("/usr/local/bin/speedtest")
        .await
        .is_err()
    {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(SpeedTestError {
                error: "Ookla Speedtest CLI not installed on server".to_string(),
            }),
        ));
    }

    tracing::info!("Starting WAN speed test via Ookla Speedtest CLI");

    let ookla_result = crate::vyos::speedtest_ookla::run_speedtest_ookla()
        .await
        .map_err(|e| {
            tracing::error!("Ookla Speedtest failed: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(SpeedTestError {
                    error: format!("Speed test failed: {e}"),
                }),
            )
        })?;

    let download_mbps = ookla_result.download.bandwidth as f64 * 8.0 / 1_000_000.0;
    let upload_mbps = ookla_result.upload.bandwidth as f64 * 8.0 / 1_000_000.0;
    let server = format!(
        "{} - {}, {}",
        ookla_result.server.name, ookla_result.server.location, ookla_result.server.country
    );

    let result = SpeedTestResult {
        download_mbps: (download_mbps * 100.0).round() / 100.0,
        upload_mbps: (upload_mbps * 100.0).round() / 100.0,
        ping_ms: ookla_result.ping.latency,
        jitter_ms: ookla_result.ping.jitter,
        packet_loss: ookla_result.packet_loss,
        isp: ookla_result.isp,
        server: server.clone(),
        result_url: ookla_result.result.url,
        tested_at: Utc::now(),
        error: None,
    };

    // Cache the result
    {
        let mut last = state.last_speedtest.lock().await;
        *last = Some(result.clone());
    }

    tracing::info!(
        "WAN speed test complete via {server}: download={:.2} Mbps, upload={:.2} Mbps, ping={:.1} ms",
        result.download_mbps,
        result.upload_mbps,
        result.ping_ms,
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

    /// A realistic Ookla Speedtest CLI JSON output for testing.
    const SPEEDTEST_SAMPLE_JSON: &str = r#"{
        "type": "result",
        "timestamp": "2026-02-21T12:28:32Z",
        "ping": {"jitter": 0.286, "latency": 3.106, "low": 2.773, "high": 3.655},
        "download": {
            "bandwidth": 117080776,
            "bytes": 422974092,
            "elapsed": 3616,
            "latency": {"iqm": 7.728, "low": 2.577, "high": 9.582, "jitter": 0.672}
        },
        "upload": {
            "bandwidth": 62761164,
            "bytes": 226159578,
            "elapsed": 3602,
            "latency": {"iqm": 17.696, "low": 2.594, "high": 23.776, "jitter": 0.887}
        },
        "packetLoss": 0,
        "isp": "Partner Communications",
        "interface": {"internalIp": "10.10.0.14", "name": "enp6s18", "macAddr": "BC:24:11:5C:C6:0A", "isVpn": false, "externalIp": "176.229.191.84"},
        "server": {"id": 14215, "host": "speedtest1.partner.co.il", "port": 8080, "name": "Partner Communications", "location": "Petah Tikva", "country": "Israel", "ip": "212.199.201.70"},
        "result": {"id": "test-uuid", "url": "https://www.speedtest.net/result/c/test-uuid", "persisted": true}
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
    fn test_parse_ookla_speedtest_json() {
        use crate::vyos::speedtest_ookla::OoklaSpeedtestResult;

        let result: OoklaSpeedtestResult =
            serde_json::from_str(SPEEDTEST_SAMPLE_JSON).expect("should parse speedtest JSON");

        let download_mbps = result.download.bandwidth as f64 * 8.0 / 1_000_000.0;
        assert!(
            (download_mbps - 936.65).abs() < 0.1,
            "expected ~936.65 Mbps download, got {download_mbps}"
        );

        let upload_mbps = result.upload.bandwidth as f64 * 8.0 / 1_000_000.0;
        assert!(
            (upload_mbps - 502.09).abs() < 0.1,
            "expected ~502.09 Mbps upload, got {upload_mbps}"
        );

        assert!((result.ping.latency - 3.106).abs() < 0.001);
        assert!((result.ping.jitter - 0.286).abs() < 0.001);
        assert!((result.packet_loss - 0.0).abs() < 0.001);
        assert_eq!(result.isp, "Partner Communications");
        assert_eq!(result.server.name, "Partner Communications");
        assert_eq!(result.server.location, "Petah Tikva");
        assert_eq!(result.server.country, "Israel");
        assert_eq!(
            result.result.url.as_deref(),
            Some("https://www.speedtest.net/result/c/test-uuid")
        );
    }

    #[test]
    fn test_parse_ookla_invalid_json() {
        use crate::vyos::speedtest_ookla::OoklaSpeedtestResult;

        let bad_json = "not json at all";
        let err = serde_json::from_str::<OoklaSpeedtestResult>(bad_json);
        assert!(err.is_err(), "should fail on invalid JSON");

        let incomplete = r#"{"ping": {"latency": 1.0}}"#;
        let err = serde_json::from_str::<OoklaSpeedtestResult>(incomplete);
        assert!(err.is_err(), "should fail on incomplete JSON");
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

    #[test]
    fn test_parse_dhcp_lease_active() {
        let text = "IP Address    MAC Address        State    Lease start          Lease expiration     Remaining  Pool       Hostname\n\
                    ----------    -----------------  ------   -------------------  -------------------  ---------  ---------  --------\n\
                    10.10.0.100   aa:bb:cc:dd:ee:ff  active   2026/02/21 10:00:00  2026/02/21 22:00:00  11:30:00   LAN        myhost\n\
                    10.10.0.101   11:22:33:44:55:66  active   2026/02/21 09:00:00  2026/02/21 21:00:00  10:00:00   LAN        -\n";

        let leases = parse_dhcp_leases_text(text);
        assert_eq!(leases.len(), 2);

        let l0 = &leases[0];
        assert_eq!(l0.ip, "10.10.0.100");
        assert_eq!(l0.mac, "aa:bb:cc:dd:ee:ff");
        assert_eq!(l0.state, "active");
        assert_eq!(l0.hostname.as_deref(), Some("myhost"));
        assert_eq!(l0.pool.as_deref(), Some("LAN"));
        assert_eq!(l0.lease_start.as_deref(), Some("2026/02/21 10:00:00"));
        assert_eq!(l0.lease_expiry.as_deref(), Some("2026/02/21 22:00:00"));
        assert_eq!(l0.remaining.as_deref(), Some("11:30:00"));

        let l1 = &leases[1];
        assert_eq!(l1.ip, "10.10.0.101");
        assert_eq!(l1.mac, "11:22:33:44:55:66");
        assert!(l1.hostname.is_none()); // "-" should be None
    }

    #[test]
    fn test_parse_dhcp_empty() {
        // "Not configured" message
        assert!(parse_dhcp_leases_text("DHCP server is not configured\n").is_empty());

        // Empty string
        assert!(parse_dhcp_leases_text("").is_empty());

        // Whitespace only
        assert!(parse_dhcp_leases_text("   \n\n  ").is_empty());

        // Error message
        assert!(parse_dhcp_leases_text("No leases found\n").is_empty());
    }

    #[test]
    fn test_parse_dhcp_single_lease() {
        let text = "IP Address    MAC Address        State    Lease start          Lease expiration     Remaining  Pool       Hostname\n\
                    ----------    -----------------  ------   -------------------  -------------------  ---------  ---------  --------\n\
                    192.168.1.50  de:ad:be:ef:00:01  expired  2026/02/20 08:00:00  2026/02/20 20:00:00  00:00:00   GUEST      laptop\n";

        let leases = parse_dhcp_leases_text(text);
        assert_eq!(leases.len(), 1);

        let l = &leases[0];
        assert_eq!(l.ip, "192.168.1.50");
        assert_eq!(l.mac, "de:ad:be:ef:00:01");
        assert_eq!(l.state, "expired");
        assert_eq!(l.hostname.as_deref(), Some("laptop"));
        assert_eq!(l.pool.as_deref(), Some("GUEST"));
    }

    #[test]
    fn test_parse_firewall_with_rules() {
        let json: Value = serde_json::from_str(
            r#"{
                "ipv4": {
                    "forward": {
                        "filter": {
                            "default-action": "drop",
                            "rule": {
                                "10": {
                                    "action": "accept",
                                    "state": {
                                        "established": "enable",
                                        "related": "enable"
                                    },
                                    "description": "Allow established/related"
                                },
                                "20": {
                                    "action": "accept",
                                    "source": {
                                        "address": "10.0.0.0/8"
                                    },
                                    "destination": {
                                        "port": "443"
                                    },
                                    "protocol": "tcp",
                                    "description": "Allow HTTPS from LAN"
                                },
                                "99": {
                                    "action": "reject",
                                    "description": "Reject all other"
                                }
                            }
                        }
                    },
                    "input": {
                        "filter": {
                            "default-action": "accept"
                        }
                    }
                },
                "ipv6": {
                    "forward": {
                        "filter": {
                            "default-action": "drop"
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let config = parse_firewall_config(&json);
        assert_eq!(config.chains.len(), 3);

        // Chains should be sorted by name
        assert_eq!(config.chains[0].name, "IPV4 Forward Filter");
        assert_eq!(config.chains[0].default_action, "drop");
        assert_eq!(config.chains[0].rules.len(), 3);

        // Rules should be sorted by number
        let r10 = &config.chains[0].rules[0];
        assert_eq!(r10.number, 10);
        assert_eq!(r10.action, "accept");
        assert_eq!(r10.state.as_deref(), Some("established, related"));
        assert_eq!(
            r10.description.as_deref(),
            Some("Allow established/related")
        );
        assert!(r10.source.is_none());
        assert!(r10.destination.is_none());
        assert!(r10.protocol.is_none());

        let r20 = &config.chains[0].rules[1];
        assert_eq!(r20.number, 20);
        assert_eq!(r20.action, "accept");
        assert_eq!(r20.source.as_deref(), Some("10.0.0.0/8"));
        assert_eq!(r20.destination.as_deref(), Some("port 443"));
        assert_eq!(r20.protocol.as_deref(), Some("tcp"));
        assert_eq!(r20.description.as_deref(), Some("Allow HTTPS from LAN"));

        let r99 = &config.chains[0].rules[2];
        assert_eq!(r99.number, 99);
        assert_eq!(r99.action, "reject");
        assert_eq!(r99.description.as_deref(), Some("Reject all other"));

        // Input filter chain
        assert_eq!(config.chains[1].name, "IPV4 Input Filter");
        assert_eq!(config.chains[1].default_action, "accept");
        assert!(config.chains[1].rules.is_empty());

        // IPv6 chain
        assert_eq!(config.chains[2].name, "IPV6 Forward Filter");
        assert_eq!(config.chains[2].default_action, "drop");
        assert!(config.chains[2].rules.is_empty());
    }

    #[test]
    fn test_parse_firewall_empty() {
        // Empty object → no chains
        let json: Value = serde_json::from_str("{}").unwrap();
        let config = parse_firewall_config(&json);
        assert!(config.chains.is_empty());

        // Null value
        let config2 = parse_firewall_config(&Value::Null);
        assert!(config2.chains.is_empty());
    }

    #[test]
    fn test_parse_firewall_with_groups_and_network() {
        let json: Value = serde_json::from_str(
            r#"{
                "ipv4": {
                    "input": {
                        "filter": {
                            "default-action": "drop",
                            "rule": {
                                "5": {
                                    "action": "accept",
                                    "source": {
                                        "group": {
                                            "address-group": "TRUSTED"
                                        }
                                    },
                                    "destination": {
                                        "network": "192.168.1.0/24",
                                        "port": "22"
                                    },
                                    "protocol": "tcp",
                                    "description": "SSH from trusted group"
                                }
                            }
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let config = parse_firewall_config(&json);
        assert_eq!(config.chains.len(), 1);
        assert_eq!(config.chains[0].rules.len(), 1);

        let r = &config.chains[0].rules[0];
        assert_eq!(r.source.as_deref(), Some("address-group: TRUSTED"));
        assert_eq!(r.destination.as_deref(), Some("192.168.1.0/24, port 22"));
    }

    // ── Interface type detection ────────────────────────────

    #[test]
    fn test_interface_type_ethernet() {
        assert_eq!(interface_type("eth0"), Some("ethernet"));
        assert_eq!(interface_type("eth1"), Some("ethernet"));
        assert_eq!(interface_type("eth10"), Some("ethernet"));
    }

    #[test]
    fn test_interface_type_bonding() {
        assert_eq!(interface_type("bond0"), Some("bonding"));
        assert_eq!(interface_type("bond1"), Some("bonding"));
    }

    #[test]
    fn test_interface_type_bridge() {
        assert_eq!(interface_type("br0"), Some("bridge"));
    }

    #[test]
    fn test_interface_type_wireguard() {
        assert_eq!(interface_type("wg0"), Some("wireguard"));
    }

    #[test]
    fn test_interface_type_loopback() {
        assert_eq!(interface_type("lo"), Some("loopback"));
    }

    #[test]
    fn test_interface_type_unknown() {
        assert_eq!(interface_type("unknown0"), None);
        assert_eq!(interface_type("xyz"), None);
    }

    // ── MAC address validation ──────────────────────────────

    #[test]
    fn test_valid_mac_addresses() {
        assert!(is_valid_mac("aa:bb:cc:dd:ee:ff"));
        assert!(is_valid_mac("AA:BB:CC:DD:EE:FF"));
        assert!(is_valid_mac("00:11:22:33:44:55"));
        assert!(is_valid_mac("aA:bB:cC:dD:eE:fF"));
    }

    #[test]
    fn test_invalid_mac_addresses() {
        assert!(!is_valid_mac(""));
        assert!(!is_valid_mac("aa:bb:cc:dd:ee"));
        assert!(!is_valid_mac("aa:bb:cc:dd:ee:ff:00"));
        assert!(!is_valid_mac("aa-bb-cc-dd-ee-ff"));
        assert!(!is_valid_mac("aabb.ccdd.eeff"));
        assert!(!is_valid_mac("gg:hh:ii:jj:kk:ll"));
        assert!(!is_valid_mac("a:bb:cc:dd:ee:ff"));
    }

    // ── DHCP static mappings parsing ────────────────────────

    #[test]
    fn test_parse_dhcp_static_mappings_basic() {
        let config: Value = serde_json::from_str(
            r#"{
                "shared-network-name": {
                    "LAN": {
                        "subnet": {
                            "10.10.0.0/24": {
                                "static-mapping": {
                                    "myhost": {
                                        "mac-address": "aa:bb:cc:dd:ee:ff",
                                        "ip-address": "10.10.0.100"
                                    },
                                    "server": {
                                        "mac-address": "11:22:33:44:55:66",
                                        "ip-address": "10.10.0.200"
                                    }
                                }
                            }
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let mappings = parse_dhcp_static_mappings(&config);
        assert_eq!(mappings.len(), 2);

        // Sorted by IP
        assert_eq!(mappings[0].name, "myhost");
        assert_eq!(mappings[0].mac, "aa:bb:cc:dd:ee:ff");
        assert_eq!(mappings[0].ip, "10.10.0.100");
        assert_eq!(mappings[0].network, "LAN");
        assert_eq!(mappings[0].subnet, "10.10.0.0/24");

        assert_eq!(mappings[1].name, "server");
        assert_eq!(mappings[1].mac, "11:22:33:44:55:66");
        assert_eq!(mappings[1].ip, "10.10.0.200");
    }

    #[test]
    fn test_parse_dhcp_static_mappings_empty() {
        let config: Value = serde_json::from_str("{}").unwrap();
        assert!(parse_dhcp_static_mappings(&config).is_empty());

        let config2: Value = serde_json::from_str(
            r#"{"shared-network-name": {"LAN": {"subnet": {"10.10.0.0/24": {}}}}}"#,
        )
        .unwrap();
        assert!(parse_dhcp_static_mappings(&config2).is_empty());
    }

    #[test]
    fn test_parse_dhcp_static_mappings_multiple_networks() {
        let config: Value = serde_json::from_str(
            r#"{
                "shared-network-name": {
                    "LAN": {
                        "subnet": {
                            "10.10.0.0/24": {
                                "static-mapping": {
                                    "host1": {
                                        "mac-address": "aa:bb:cc:dd:ee:ff",
                                        "ip-address": "10.10.0.50"
                                    }
                                }
                            }
                        }
                    },
                    "GUEST": {
                        "subnet": {
                            "192.168.1.0/24": {
                                "static-mapping": {
                                    "printer": {
                                        "mac-address": "11:22:33:44:55:66",
                                        "ip-address": "192.168.1.10"
                                    }
                                }
                            }
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let mappings = parse_dhcp_static_mappings(&config);
        assert_eq!(mappings.len(), 2);

        // Should be sorted by IP
        let lan = mappings.iter().find(|m| m.network == "LAN").unwrap();
        assert_eq!(lan.name, "host1");
        assert_eq!(lan.ip, "10.10.0.50");

        let guest = mappings.iter().find(|m| m.network == "GUEST").unwrap();
        assert_eq!(guest.name, "printer");
        assert_eq!(guest.ip, "192.168.1.10");
    }

    #[tokio::test]
    async fn test_speedtest_rate_limit() {
        use std::sync::Arc;
        use tokio::sync::Mutex;

        // Create a cached result that was just done
        let recent_result = SpeedTestResult {
            download_mbps: 500.0,
            upload_mbps: 450.0,
            ping_ms: 3.1,
            jitter_ms: 0.3,
            packet_loss: 0.0,
            isp: "Test ISP".to_string(),
            server: "Test Server - Test City, Test Country".to_string(),
            result_url: None,
            tested_at: Utc::now(),
            error: None,
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
            ping_ms: 3.1,
            jitter_ms: 0.3,
            packet_loss: 0.0,
            isp: "Test ISP".to_string(),
            server: "Test Server - Test City, Test Country".to_string(),
            result_url: None,
            tested_at: Utc::now() - chrono::Duration::seconds(120),
            error: None,
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
