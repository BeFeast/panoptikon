use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use super::audit;
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
    #[serde(default)]
    pub disabled: bool,
}

/// A firewall chain (e.g. "IPv4 Forward Filter") with its rules.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallChain {
    pub name: String,
    pub default_action: String,
    pub rules: Vec<FirewallRule>,
    /// VyOS config path components: [ip_version, direction, filter_type]
    pub path: Vec<String>,
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

                        let disabled = rule_obj.contains_key("disable");

                        rules.push(FirewallRule {
                            number,
                            action,
                            source,
                            destination,
                            protocol,
                            state,
                            description,
                            disabled,
                        });
                    }
                }

                // Sort rules by number
                rules.sort_by_key(|r| r.number);

                chains.push(FirewallChain {
                    name: chain_name,
                    default_action,
                    rules,
                    path: vec![ip_version.clone(), direction.clone(), filter_type.clone()],
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

// ── Firewall Rule CRUD ──────────────────────────────────────────────────────

/// Path parameters for firewall chain endpoints.
#[derive(Debug, Deserialize)]
pub struct FirewallChainPath {
    /// Chain name as VyOS path: "ipv4.forward.filter"
    pub chain: String,
}

/// Path parameters for firewall rule endpoints.
#[derive(Debug, Deserialize)]
pub struct FirewallRulePath {
    /// Chain name as VyOS path: "ipv4.forward.filter"
    pub chain: String,
    /// Rule number
    pub number: u32,
}

/// Request body for creating or updating a firewall rule.
#[derive(Debug, Deserialize)]
pub struct FirewallRuleRequest {
    pub number: u32,
    pub action: String,
    #[serde(default)]
    pub protocol: Option<String>,
    #[serde(default)]
    pub source_address: Option<String>,
    #[serde(default)]
    pub source_port: Option<String>,
    #[serde(default)]
    pub destination_address: Option<String>,
    #[serde(default)]
    pub destination_port: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub state: Option<Vec<String>>,
    #[serde(default)]
    pub disabled: bool,
}

/// Request body for toggling a firewall rule's enabled state.
#[derive(Debug, Deserialize)]
pub struct FirewallRuleToggleRequest {
    pub disabled: bool,
}

/// Parse a chain path string "ipv4.forward.filter" into VyOS config path segments.
fn parse_chain_path(chain: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<&str> = chain.split('.').collect();
    if parts.len() != 3 {
        return Err(format!(
            "Invalid chain path '{}': expected format 'ipv4.forward.filter'",
            chain
        ));
    }
    let ip_version = parts[0];
    let direction = parts[1];
    let filter_type = parts[2];

    // Validate
    if !matches!(ip_version, "ipv4" | "ipv6") {
        return Err(format!("Invalid IP version: '{}'", ip_version));
    }
    if !matches!(direction, "forward" | "input" | "output") {
        return Err(format!("Invalid direction: '{}'", direction));
    }
    if filter_type.is_empty()
        || !filter_type
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("Invalid filter type: '{}'", filter_type));
    }
    Ok(parts)
}

/// Build the VyOS config path prefix for a chain + rule number.
fn firewall_rule_base_path(chain_parts: &[&str], rule_number: u32) -> Vec<String> {
    vec![
        "firewall".to_string(),
        chain_parts[0].to_string(),
        chain_parts[1].to_string(),
        chain_parts[2].to_string(),
        "rule".to_string(),
        rule_number.to_string(),
    ]
}

/// Validate a firewall rule request body.
fn validate_firewall_rule(body: &FirewallRuleRequest) -> Result<(), String> {
    if body.number == 0 || body.number > 99999 {
        return Err("Rule number must be between 1 and 99999".to_string());
    }

    if !matches!(
        body.action.as_str(),
        "accept" | "drop" | "reject" | "jump" | "return" | "queue"
    ) {
        return Err(format!("Invalid action: '{}'", body.action));
    }

    if let Some(ref proto) = body.protocol {
        if !matches!(
            proto.as_str(),
            "tcp" | "udp" | "tcp_udp" | "icmp" | "all" | "ah" | "esp" | "gre"
        ) {
            return Err(format!("Invalid protocol: '{}'", proto));
        }
    }

    // Validate IP addresses (simple check for CIDR or plain IP)
    if let Some(ref addr) = body.source_address {
        if !is_valid_ip_or_cidr(addr) {
            return Err(format!("Invalid source address: '{}'", addr));
        }
    }
    if let Some(ref addr) = body.destination_address {
        if !is_valid_ip_or_cidr(addr) {
            return Err(format!("Invalid destination address: '{}'", addr));
        }
    }

    // Validate ports (only if protocol is tcp/udp)
    if let Some(ref port) = body.source_port {
        if !is_valid_port(port) {
            return Err(format!("Invalid source port: '{}'", port));
        }
    }
    if let Some(ref port) = body.destination_port {
        if !is_valid_port(port) {
            return Err(format!("Invalid destination port: '{}'", port));
        }
    }

    // Validate state values
    if let Some(ref states) = body.state {
        for s in states {
            if !matches!(s.as_str(), "new" | "established" | "related" | "invalid") {
                return Err(format!("Invalid state: '{}'", s));
            }
        }
    }

    Ok(())
}

/// Check if a string looks like a valid IPv4/IPv6 address or CIDR.
fn is_valid_ip_or_cidr(addr: &str) -> bool {
    // Allow "!" prefix for negation
    let addr = addr.strip_prefix('!').unwrap_or(addr);
    if addr.is_empty() {
        return false;
    }
    // Check for CIDR notation
    if let Some((ip_part, prefix)) = addr.split_once('/') {
        if prefix.parse::<u8>().is_err() {
            return false;
        }
        return ip_part.parse::<std::net::IpAddr>().is_ok();
    }
    // Plain IP address
    addr.parse::<std::net::IpAddr>().is_ok()
}

/// Check if a port string is valid (single port or range like "80" or "1024-65535").
fn is_valid_port(port: &str) -> bool {
    if port.is_empty() {
        return false;
    }
    // Port range: "1024-65535"
    if let Some((start, end)) = port.split_once('-') {
        return start.parse::<u16>().is_ok() && end.parse::<u16>().is_ok();
    }
    // Comma-separated: "80,443"
    port.split(',').all(|p| p.trim().parse::<u16>().is_ok())
}

/// Apply a single firewall rule's configuration values to VyOS.
async fn apply_firewall_rule_config(
    client: &crate::vyos::client::VyosClient,
    base: &[String],
    body: &FirewallRuleRequest,
) -> Result<(), String> {
    let base_strs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();

    // Set action (required)
    let mut action_path = base_strs.clone();
    action_path.push("action");
    action_path.push(&body.action);
    client
        .configure_set(&action_path)
        .await
        .map_err(|e| format!("Failed to set action: {e}"))?;

    // Set protocol
    if let Some(ref proto) = body.protocol {
        let mut path = base_strs.clone();
        path.push("protocol");
        path.push(proto);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set protocol: {e}"))?;
    }

    // Set source address
    if let Some(ref addr) = body.source_address {
        let mut path = base_strs.clone();
        path.push("source");
        path.push("address");
        path.push(addr);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set source address: {e}"))?;
    }

    // Set source port
    if let Some(ref port) = body.source_port {
        let mut path = base_strs.clone();
        path.push("source");
        path.push("port");
        path.push(port);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set source port: {e}"))?;
    }

    // Set destination address
    if let Some(ref addr) = body.destination_address {
        let mut path = base_strs.clone();
        path.push("destination");
        path.push("address");
        path.push(addr);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set destination address: {e}"))?;
    }

    // Set destination port
    if let Some(ref port) = body.destination_port {
        let mut path = base_strs.clone();
        path.push("destination");
        path.push("port");
        path.push(port);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set destination port: {e}"))?;
    }

    // Set description
    if let Some(ref desc) = body.description {
        let mut path = base_strs.clone();
        path.push("description");
        path.push(desc);
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set description: {e}"))?;
    }

    // Set state flags
    if let Some(ref states) = body.state {
        for s in states {
            let enable_str = "enable";
            let mut path = base_strs.clone();
            path.push("state");
            path.push(s);
            path.push(enable_str);
            client
                .configure_set(&path)
                .await
                .map_err(|e| format!("Failed to set state {s}: {e}"))?;
        }
    }

    // Set disabled flag
    if body.disabled {
        let mut path = base_strs.clone();
        path.push("disable");
        client
            .configure_set(&path)
            .await
            .map_err(|e| format!("Failed to set disable: {e}"))?;
    }

    Ok(())
}

/// POST /api/v1/vyos/firewall/:chain/rules — create a firewall rule.
pub async fn create_firewall_rule(
    State(state): State<AppState>,
    Path(path): Path<FirewallChainPath>,
    Json(body): Json<FirewallRuleRequest>,
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

    let chain_parts = parse_chain_path(&path.chain).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    if let Err(e) = validate_firewall_rule(&body) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        ));
    }

    let base = firewall_rule_base_path(&chain_parts, body.number);

    tracing::info!(
        "VyOS: creating firewall rule {} in chain {} (action={})",
        body.number,
        path.chain,
        body.action
    );

    let description = format!(
        "Create firewall rule {} in chain {} (action={})",
        body.number, path.chain, body.action
    );
    let commands = vec![format!(
        "set firewall {} rule {} ...",
        path.chain, body.number
    )];

    if let Err(e) = apply_firewall_rule_config(&client, &base, &body).await {
        tracing::error!("VyOS firewall rule create failed: {e}");
        audit::log_failure(
            &state.db,
            "firewall_rule_create",
            &description,
            &commands,
            &e,
        )
        .await;
        // Attempt cleanup on failure
        let base_strs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();
        let _ = client.configure_delete(&base_strs).await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        ));
    }

    audit::log_success(&state.db, "firewall_rule_create", &description, &commands).await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Rule {} created in {}", body.number, path.chain),
    }))
}

/// PUT /api/v1/vyos/firewall/:chain/rules/:number — update a firewall rule.
///
/// Deletes the existing rule first, then re-creates it with the new values.
pub async fn update_firewall_rule(
    State(state): State<AppState>,
    Path(path): Path<FirewallRulePath>,
    Json(body): Json<FirewallRuleRequest>,
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

    let chain_parts = parse_chain_path(&path.chain).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    if let Err(e) = validate_firewall_rule(&body) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        ));
    }

    let base = firewall_rule_base_path(&chain_parts, path.number);
    let base_strs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();

    tracing::info!(
        "VyOS: updating firewall rule {} in chain {} (action={})",
        path.number,
        path.chain,
        body.action
    );

    let description = format!(
        "Update firewall rule {} in chain {} (action={})",
        path.number, path.chain, body.action
    );
    let commands = vec![
        format!("delete firewall {} rule {}", path.chain, path.number),
        format!("set firewall {} rule {} ...", path.chain, path.number),
    ];

    // Delete the existing rule first
    if let Err(e) = client.configure_delete(&base_strs).await {
        tracing::error!("VyOS firewall rule delete (for update) failed: {e}");
        let msg = format!("Failed to delete existing rule for update: {e}");
        audit::log_failure(
            &state.db,
            "firewall_rule_update",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Re-create with the updated values
    if let Err(e) = apply_firewall_rule_config(&client, &base, &body).await {
        tracing::error!("VyOS firewall rule re-create (for update) failed: {e}");
        audit::log_failure(
            &state.db,
            "firewall_rule_update",
            &description,
            &commands,
            &e,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        ));
    }

    audit::log_success(&state.db, "firewall_rule_update", &description, &commands).await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Rule {} updated in {}", path.number, path.chain),
    }))
}

/// DELETE /api/v1/vyos/firewall/:chain/rules/:number — delete a firewall rule.
pub async fn delete_firewall_rule(
    State(state): State<AppState>,
    Path(path): Path<FirewallRulePath>,
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

    let chain_parts = parse_chain_path(&path.chain).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    let base = firewall_rule_base_path(&chain_parts, path.number);
    let base_strs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();

    tracing::info!(
        "VyOS: deleting firewall rule {} from chain {}",
        path.number,
        path.chain
    );

    let description = format!(
        "Delete firewall rule {} from chain {}",
        path.number, path.chain
    );
    let commands = vec![format!(
        "delete firewall {} rule {}",
        path.chain, path.number
    )];

    match client.configure_delete(&base_strs).await {
        Ok(_) => {
            audit::log_success(&state.db, "firewall_rule_delete", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Rule {} deleted from {}", path.number, path.chain),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS firewall rule delete failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "firewall_rule_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// PATCH /api/v1/vyos/firewall/:chain/rules/:number/enabled — toggle a rule.
pub async fn toggle_firewall_rule(
    State(state): State<AppState>,
    Path(path): Path<FirewallRulePath>,
    Json(body): Json<FirewallRuleToggleRequest>,
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

    let chain_parts = parse_chain_path(&path.chain).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    let base = firewall_rule_base_path(&chain_parts, path.number);
    let mut disable_path: Vec<&str> = base.iter().map(|s| s.as_str()).collect();
    disable_path.push("disable");

    let action = if body.disabled { "disable" } else { "enable" };
    tracing::info!(
        "VyOS: {} firewall rule {} in chain {}",
        action,
        path.number,
        path.chain
    );

    let description = format!(
        "{} firewall rule {} in chain {}",
        if body.disabled { "Disable" } else { "Enable" },
        path.number,
        path.chain
    );
    let commands = vec![if body.disabled {
        format!("set firewall {} rule {} disable", path.chain, path.number)
    } else {
        format!(
            "delete firewall {} rule {} disable",
            path.chain, path.number
        )
    }];

    let result = if body.disabled {
        client.configure_set(&disable_path).await
    } else {
        client.configure_delete(&disable_path).await
    };

    match result {
        Ok(_) => {
            audit::log_success(&state.db, "firewall_rule_toggle", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Rule {} {}d in {}", path.number, action, path.chain),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS firewall rule toggle failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "firewall_rule_toggle",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
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

    let description = format!(
        "{} interface {} ({})",
        if body.disable { "Disable" } else { "Enable" },
        name,
        iface_type
    );
    let commands = vec![if body.disable {
        format!("set interfaces {iface_type} {name} disable")
    } else {
        format!("delete interfaces {iface_type} {name} disable")
    }];

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
        Ok(_) => {
            audit::log_success(&state.db, "interface_toggle", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Interface {name} {action}d successfully"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS interface {action} failed for {name}: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(&state.db, "interface_toggle", &description, &commands, &msg).await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
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

    let audit_desc = format!(
        "Create DHCP static mapping '{}': {} -> {} (network={}, subnet={})",
        body.name, body.mac, body.ip, body.network, body.subnet
    );
    let audit_commands = vec![
        format!("set service dhcp-server shared-network-name {} subnet {} static-mapping {} mac-address {}", body.network, body.subnet, body.name, body.mac),
        format!("set service dhcp-server shared-network-name {} subnet {} static-mapping {} ip-address {}", body.network, body.subnet, body.name, body.ip),
    ];

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
        let msg = format!("Failed to set MAC address: {e}");
        audit::log_failure(
            &state.db,
            "dhcp_static_mapping_create",
            &audit_desc,
            &audit_commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
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
        let msg = format!("Failed to set IP address: {e}");
        audit::log_failure(
            &state.db,
            "dhcp_static_mapping_create",
            &audit_desc,
            &audit_commands,
            &msg,
        )
        .await;
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
                message: msg,
            }),
        ));
    }

    tracing::info!(
        "VyOS: DHCP static mapping '{}' created ({base_path})",
        body.name
    );

    audit::log_success(
        &state.db,
        "dhcp_static_mapping_create",
        &audit_desc,
        &audit_commands,
    )
    .await;

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

    let description = format!(
        "Delete DHCP static mapping '{}' (network={}, subnet={})",
        path.name, path.network, path.subnet
    );
    let commands = vec![format!(
        "delete service dhcp-server shared-network-name {} subnet {} static-mapping {}",
        path.network, path.subnet, path.name
    )];

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
        Ok(_) => {
            audit::log_success(
                &state.db,
                "dhcp_static_mapping_delete",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Static mapping '{}' deleted", path.name),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS DHCP static-mapping delete failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "dhcp_static_mapping_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
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

// ── Static Routes ───────────────────────────────────────────────────────────

/// Request body for creating a static route.
#[derive(Debug, Deserialize)]
pub struct CreateStaticRouteRequest {
    /// Destination CIDR (e.g., "10.0.0.0/8")
    pub destination: String,
    /// Next-hop IP (e.g., "192.168.1.1"). Omit for blackhole routes.
    pub next_hop: Option<String>,
    /// Admin distance (optional, default: 1)
    pub distance: Option<u32>,
    /// Description (optional)
    pub description: Option<String>,
    /// Blackhole (null route) — drops traffic to destination
    pub blackhole: Option<bool>,
}

/// POST /api/v1/vyos/routes/static — create a static route.
pub async fn create_static_route(
    State(state): State<AppState>,
    Json(body): Json<CreateStaticRouteRequest>,
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

    // Validate destination CIDR
    if !is_valid_cidr(&body.destination) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid destination CIDR. Expected format: x.x.x.x/n".to_string(),
            }),
        ));
    }

    let is_blackhole = body.blackhole.unwrap_or(false);

    // Require either next_hop or blackhole
    if !is_blackhole && body.next_hop.is_none() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Either next-hop IP or blackhole option is required".to_string(),
            }),
        ));
    }

    // Validate next-hop IP if provided
    if let Some(ref nh) = body.next_hop {
        if !is_valid_ip(nh) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(VyosWriteResponse {
                    success: false,
                    message: "Invalid next-hop IP address".to_string(),
                }),
            ));
        }
    }

    // Validate distance if provided
    if let Some(d) = body.distance {
        if d > 255 {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(VyosWriteResponse {
                    success: false,
                    message: "Distance must be between 0 and 255".to_string(),
                }),
            ));
        }
    }

    if is_blackhole {
        // Blackhole route: set protocols static route <dest> blackhole
        tracing::info!(
            "VyOS: creating blackhole static route for {}",
            body.destination
        );

        let result = client
            .configure_set(&[
                "protocols",
                "static",
                "route",
                &body.destination,
                "blackhole",
            ])
            .await;

        if let Err(e) = result {
            tracing::error!("VyOS static route blackhole set failed: {e}");
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("Failed to create blackhole route: {e}"),
                }),
            ));
        }

        // Set description if provided
        if let Some(ref desc) = body.description {
            if !desc.is_empty() {
                let _ = client
                    .configure_set(&[
                        "protocols",
                        "static",
                        "route",
                        &body.destination,
                        "description",
                        desc,
                    ])
                    .await;
            }
        }

        // Set distance if provided
        if let Some(d) = body.distance {
            let dist_str = d.to_string();
            let _ = client
                .configure_set(&[
                    "protocols",
                    "static",
                    "route",
                    &body.destination,
                    "blackhole",
                    "distance",
                    &dist_str,
                ])
                .await;
        }

        Ok(Json(VyosWriteResponse {
            success: true,
            message: format!("Blackhole route for {} created", body.destination),
        }))
    } else {
        let next_hop = body.next_hop.as_deref().unwrap();

        tracing::info!(
            "VyOS: creating static route {} via {}",
            body.destination,
            next_hop
        );

        // Set next-hop
        let result = client
            .configure_set(&[
                "protocols",
                "static",
                "route",
                &body.destination,
                "next-hop",
                next_hop,
            ])
            .await;

        if let Err(e) = result {
            tracing::error!("VyOS static route next-hop set failed: {e}");
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("Failed to create static route: {e}"),
                }),
            ));
        }

        // Set distance if provided
        if let Some(d) = body.distance {
            let dist_str = d.to_string();
            let _ = client
                .configure_set(&[
                    "protocols",
                    "static",
                    "route",
                    &body.destination,
                    "next-hop",
                    next_hop,
                    "distance",
                    &dist_str,
                ])
                .await;
        }

        // Set description if provided
        if let Some(ref desc) = body.description {
            if !desc.is_empty() {
                let _ = client
                    .configure_set(&[
                        "protocols",
                        "static",
                        "route",
                        &body.destination,
                        "description",
                        desc,
                    ])
                    .await;
            }
        }

        Ok(Json(VyosWriteResponse {
            success: true,
            message: format!("Static route {} via {} created", body.destination, next_hop),
        }))
    }
}

/// DELETE /api/v1/vyos/routes/static/:destination — delete a static route.
pub async fn delete_static_route(
    State(state): State<AppState>,
    Path(destination): Path<String>,
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

    // The destination comes URL-encoded (e.g., "10.0.0.0%2F8" → "10.0.0.0/8")
    // Axum decodes path parameters automatically.
    tracing::info!("VyOS: deleting static route {}", destination);

    let result = client
        .configure_delete(&["protocols", "static", "route", &destination])
        .await;

    match result {
        Ok(_) => Ok(Json(VyosWriteResponse {
            success: true,
            message: format!("Static route {} deleted", destination),
        })),
        Err(e) => {
            tracing::error!("VyOS static route delete failed: {e}");
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

// ── Firewall Groups ─────────────────────────────────────────────────────────

/// A firewall address group (a named set of IP addresses).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallAddressGroup {
    pub name: String,
    pub description: Option<String>,
    pub members: Vec<String>,
}

/// A firewall network group (a named set of CIDR subnets).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallNetworkGroup {
    pub name: String,
    pub description: Option<String>,
    pub members: Vec<String>,
}

/// A firewall port group (a named set of ports and port ranges).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallPortGroup {
    pub name: String,
    pub description: Option<String>,
    pub members: Vec<String>,
}

/// All firewall groups.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FirewallGroups {
    pub address_groups: Vec<FirewallAddressGroup>,
    pub network_groups: Vec<FirewallNetworkGroup>,
    pub port_groups: Vec<FirewallPortGroup>,
}

/// Parse firewall groups from VyOS config JSON.
///
/// Expected structure under `firewall.group`:
/// ```json
/// {
///   "address-group": { "BLOCKED_IPS": { "address": "1.2.3.4", "description": "..." } },
///   "network-group": { "TRUSTED_NETS": { "network": ["10.0.0.0/8", "172.16.0.0/12"] } },
///   "port-group": { "WEB_PORTS": { "port": ["80", "443", "8080-8090"] } }
/// }
/// ```
pub fn parse_firewall_groups(value: &Value) -> FirewallGroups {
    let obj = match value.as_object() {
        Some(o) => o,
        None => {
            return FirewallGroups {
                address_groups: Vec::new(),
                network_groups: Vec::new(),
                port_groups: Vec::new(),
            }
        }
    };

    let address_groups = parse_group_entries(obj.get("address-group"), "address");
    let network_groups = parse_group_entries(obj.get("network-group"), "network");
    let port_groups = parse_group_entries(obj.get("port-group"), "port");

    FirewallGroups {
        address_groups: address_groups
            .into_iter()
            .map(|(name, desc, members)| FirewallAddressGroup {
                name,
                description: desc,
                members,
            })
            .collect(),
        network_groups: network_groups
            .into_iter()
            .map(|(name, desc, members)| FirewallNetworkGroup {
                name,
                description: desc,
                members,
            })
            .collect(),
        port_groups: port_groups
            .into_iter()
            .map(|(name, desc, members)| FirewallPortGroup {
                name,
                description: desc,
                members,
            })
            .collect(),
    }
}

/// Parse group entries from VyOS group config for a given member key.
///
/// Members can be a single string value or an array of strings.
fn parse_group_entries(
    group_val: Option<&Value>,
    member_key: &str,
) -> Vec<(String, Option<String>, Vec<String>)> {
    let mut entries = Vec::new();

    let groups = match group_val.and_then(|v| v.as_object()) {
        Some(g) => g,
        None => return entries,
    };

    for (group_name, group_data) in groups {
        let data_obj = match group_data.as_object() {
            Some(o) => o,
            None => continue,
        };

        let description = data_obj
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let members = match data_obj.get(member_key) {
            Some(Value::String(s)) => vec![s.clone()],
            Some(Value::Array(arr)) => arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
            // VyOS may also return a number for port values
            Some(Value::Number(n)) => vec![n.to_string()],
            _ => Vec::new(),
        };

        entries.push((group_name.clone(), description, members));
    }

    entries.sort_by(|a, b| a.0.cmp(&b.0));
    entries
}

/// GET /api/v1/vyos/firewall/groups — fetch firewall groups from VyOS.
pub async fn firewall_groups(
    State(state): State<AppState>,
) -> Result<Json<FirewallGroups>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;

    match client.retrieve(&["firewall", "group"]).await {
        Ok(data) => {
            let groups = parse_firewall_groups(&data);
            Ok(Json(groups))
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("empty") || msg.contains("does not exist") {
                Ok(Json(FirewallGroups {
                    address_groups: Vec::new(),
                    network_groups: Vec::new(),
                    port_groups: Vec::new(),
                }))
            } else {
                tracing::error!("VyOS firewall groups query failed: {e}");
                Err(StatusCode::BAD_GATEWAY)
            }
        }
    }
}

/// Request body for creating an address group.
#[derive(Debug, Deserialize)]
pub struct CreateAddressGroupRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub addresses: Vec<String>,
}

/// Request body for creating a network group.
#[derive(Debug, Deserialize)]
pub struct CreateNetworkGroupRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub networks: Vec<String>,
}

/// Request body for creating a port group.
#[derive(Debug, Deserialize)]
pub struct CreatePortGroupRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
}

/// Request body for adding a member to a group.
#[derive(Debug, Deserialize)]
pub struct AddGroupMemberRequest {
    pub value: String,
}

/// Validate a group name (alphanumeric, hyphens, underscores, must not be empty).
fn validate_group_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Group name cannot be empty".to_string());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(
            "Group name must contain only alphanumeric characters, hyphens, and underscores"
                .to_string(),
        );
    }
    Ok(())
}

/// Validate an IP address (v4 only, no CIDR).
fn is_valid_ip(ip: &str) -> bool {
    ip.parse::<std::net::Ipv4Addr>().is_ok()
}

/// Validate a CIDR network (e.g. "10.0.0.0/8").
fn is_valid_cidr(cidr: &str) -> bool {
    let parts: Vec<&str> = cidr.split('/').collect();
    if parts.len() != 2 {
        return false;
    }
    if parts[0].parse::<std::net::Ipv4Addr>().is_err() {
        return false;
    }
    match parts[1].parse::<u8>() {
        Ok(prefix) => prefix <= 32,
        Err(_) => false,
    }
}

/// Validate a port or port range (e.g. "80", "8080-8090").
fn is_valid_port_entry(port: &str) -> bool {
    if let Some((start, end)) = port.split_once('-') {
        // Port range
        match (start.parse::<u16>(), end.parse::<u16>()) {
            (Ok(s), Ok(e)) => s > 0 && e > 0 && s <= e,
            _ => false,
        }
    } else {
        // Single port
        match port.parse::<u16>() {
            Ok(p) => p > 0,
            Err(_) => false,
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/address-group — create an address group.
pub async fn create_address_group(
    State(state): State<AppState>,
    Json(body): Json<CreateAddressGroupRequest>,
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

    if let Err(msg) = validate_group_name(&body.name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Validate all addresses
    for addr in &body.addresses {
        if !is_valid_ip(addr) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("Invalid IP address: {addr}"),
                }),
            ));
        }
    }

    tracing::info!("VyOS: creating address-group '{}'", body.name);

    let audit_desc = format!(
        "Create address group '{}' with {} addresses",
        body.name,
        body.addresses.len()
    );
    let mut audit_commands: Vec<String> = Vec::new();
    if let Some(ref desc) = body.description {
        audit_commands.push(format!(
            "set firewall group address-group {} description '{}'",
            body.name, desc
        ));
    }
    for addr in &body.addresses {
        audit_commands.push(format!(
            "set firewall group address-group {} address {}",
            body.name, addr
        ));
    }

    // Set description if provided
    if let Some(ref desc) = body.description {
        if let Err(e) = client
            .configure_set(&[
                "firewall",
                "group",
                "address-group",
                &body.name,
                "description",
                desc,
            ])
            .await
        {
            tracing::error!("VyOS address-group description set failed: {e}");
            let msg = format!("Failed to set description: {e}");
            audit::log_failure(
                &state.db,
                "address_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    // Add each address
    for addr in &body.addresses {
        if let Err(e) = client
            .configure_set(&[
                "firewall",
                "group",
                "address-group",
                &body.name,
                "address",
                addr,
            ])
            .await
        {
            tracing::error!("VyOS address-group address add failed: {e}");
            let msg = format!("Failed to add address {addr}: {e}");
            audit::log_failure(
                &state.db,
                "address_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    audit::log_success(
        &state.db,
        "address_group_create",
        &audit_desc,
        &audit_commands,
    )
    .await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Address group '{}' created", body.name),
    }))
}

/// DELETE /api/v1/vyos/firewall/groups/address-group/:name — delete an address group.
pub async fn delete_address_group(
    State(state): State<AppState>,
    Path(name): Path<String>,
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

    tracing::info!("VyOS: deleting address-group '{name}'");

    let description = format!("Delete address group '{name}'");
    let commands = vec![format!("delete firewall group address-group {name}")];

    match client
        .configure_delete(&["firewall", "group", "address-group", &name])
        .await
    {
        Ok(_) => {
            audit::log_success(&state.db, "address_group_delete", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Address group '{name}' deleted"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS address-group delete failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "address_group_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/address-group/:name/members — add a member.
pub async fn add_address_group_member(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<AddGroupMemberRequest>,
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

    if !is_valid_ip(&body.value) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Invalid IP address: {}", body.value),
            }),
        ));
    }

    tracing::info!(
        "VyOS: adding address '{}' to address-group '{name}'",
        body.value
    );

    let description = format!("Add address '{}' to address group '{name}'", body.value);
    let commands = vec![format!(
        "set firewall group address-group {name} address {}",
        body.value
    )];

    match client
        .configure_set(&[
            "firewall",
            "group",
            "address-group",
            &name,
            "address",
            &body.value,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "address_group_member_add",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Address '{}' added to group '{name}'", body.value),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS address-group member add failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "address_group_member_add",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// DELETE /api/v1/vyos/firewall/groups/address-group/:name/members/:value — remove a member.
pub async fn remove_address_group_member(
    State(state): State<AppState>,
    Path((name, value)): Path<(String, String)>,
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

    tracing::info!("VyOS: removing address '{value}' from address-group '{name}'");

    let description = format!("Remove address '{value}' from address group '{name}'");
    let commands = vec![format!(
        "delete firewall group address-group {name} address {value}"
    )];

    match client
        .configure_delete(&[
            "firewall",
            "group",
            "address-group",
            &name,
            "address",
            &value,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "address_group_member_remove",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Address '{value}' removed from group '{name}'"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS address-group member remove failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "address_group_member_remove",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/network-group — create a network group.
pub async fn create_network_group(
    State(state): State<AppState>,
    Json(body): Json<CreateNetworkGroupRequest>,
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

    if let Err(msg) = validate_group_name(&body.name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    for net in &body.networks {
        if !is_valid_cidr(net) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("Invalid CIDR network: {net}"),
                }),
            ));
        }
    }

    tracing::info!("VyOS: creating network-group '{}'", body.name);

    let audit_desc = format!(
        "Create network group '{}' with {} networks",
        body.name,
        body.networks.len()
    );
    let mut audit_commands: Vec<String> = Vec::new();
    if let Some(ref desc) = body.description {
        audit_commands.push(format!(
            "set firewall group network-group {} description '{}'",
            body.name, desc
        ));
    }
    for net in &body.networks {
        audit_commands.push(format!(
            "set firewall group network-group {} network {}",
            body.name, net
        ));
    }

    if let Some(ref desc) = body.description {
        if let Err(e) = client
            .configure_set(&[
                "firewall",
                "group",
                "network-group",
                &body.name,
                "description",
                desc,
            ])
            .await
        {
            tracing::error!("VyOS network-group description set failed: {e}");
            let msg = format!("Failed to set description: {e}");
            audit::log_failure(
                &state.db,
                "network_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    for net in &body.networks {
        if let Err(e) = client
            .configure_set(&[
                "firewall",
                "group",
                "network-group",
                &body.name,
                "network",
                net,
            ])
            .await
        {
            tracing::error!("VyOS network-group network add failed: {e}");
            let msg = format!("Failed to add network {net}: {e}");
            audit::log_failure(
                &state.db,
                "network_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    audit::log_success(
        &state.db,
        "network_group_create",
        &audit_desc,
        &audit_commands,
    )
    .await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Network group '{}' created", body.name),
    }))
}

/// DELETE /api/v1/vyos/firewall/groups/network-group/:name — delete a network group.
pub async fn delete_network_group(
    State(state): State<AppState>,
    Path(name): Path<String>,
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

    tracing::info!("VyOS: deleting network-group '{name}'");

    let description = format!("Delete network group '{name}'");
    let commands = vec![format!("delete firewall group network-group {name}")];

    match client
        .configure_delete(&["firewall", "group", "network-group", &name])
        .await
    {
        Ok(_) => {
            audit::log_success(&state.db, "network_group_delete", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Network group '{name}' deleted"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS network-group delete failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "network_group_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/network-group/:name/members — add a member.
pub async fn add_network_group_member(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<AddGroupMemberRequest>,
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

    if !is_valid_cidr(&body.value) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Invalid CIDR network: {}", body.value),
            }),
        ));
    }

    tracing::info!(
        "VyOS: adding network '{}' to network-group '{name}'",
        body.value
    );

    let description = format!("Add network '{}' to network group '{name}'", body.value);
    let commands = vec![format!(
        "set firewall group network-group {name} network {}",
        body.value
    )];

    match client
        .configure_set(&[
            "firewall",
            "group",
            "network-group",
            &name,
            "network",
            &body.value,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "network_group_member_add",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Network '{}' added to group '{name}'", body.value),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS network-group member add failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "network_group_member_add",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// DELETE /api/v1/vyos/firewall/groups/network-group/:name/members/:value — remove a member.
pub async fn remove_network_group_member(
    State(state): State<AppState>,
    Path((name, value)): Path<(String, String)>,
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

    tracing::info!("VyOS: removing network '{value}' from network-group '{name}'");

    let description = format!("Remove network '{value}' from network group '{name}'");
    let commands = vec![format!(
        "delete firewall group network-group {name} network {value}"
    )];

    match client
        .configure_delete(&[
            "firewall",
            "group",
            "network-group",
            &name,
            "network",
            &value,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "network_group_member_remove",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Network '{value}' removed from group '{name}'"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS network-group member remove failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "network_group_member_remove",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/port-group — create a port group.
pub async fn create_port_group(
    State(state): State<AppState>,
    Json(body): Json<CreatePortGroupRequest>,
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

    if let Err(msg) = validate_group_name(&body.name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    for port in &body.ports {
        if !is_valid_port_entry(port) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(VyosWriteResponse {
                    success: false,
                    message: format!("Invalid port or port range: {port}"),
                }),
            ));
        }
    }

    tracing::info!("VyOS: creating port-group '{}'", body.name);

    let audit_desc = format!(
        "Create port group '{}' with {} ports",
        body.name,
        body.ports.len()
    );
    let mut audit_commands: Vec<String> = Vec::new();
    if let Some(ref desc) = body.description {
        audit_commands.push(format!(
            "set firewall group port-group {} description '{}'",
            body.name, desc
        ));
    }
    for port in &body.ports {
        audit_commands.push(format!(
            "set firewall group port-group {} port {}",
            body.name, port
        ));
    }

    if let Some(ref desc) = body.description {
        if let Err(e) = client
            .configure_set(&[
                "firewall",
                "group",
                "port-group",
                &body.name,
                "description",
                desc,
            ])
            .await
        {
            tracing::error!("VyOS port-group description set failed: {e}");
            let msg = format!("Failed to set description: {e}");
            audit::log_failure(
                &state.db,
                "port_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    for port in &body.ports {
        if let Err(e) = client
            .configure_set(&["firewall", "group", "port-group", &body.name, "port", port])
            .await
        {
            tracing::error!("VyOS port-group port add failed: {e}");
            let msg = format!("Failed to add port {port}: {e}");
            audit::log_failure(
                &state.db,
                "port_group_create",
                &audit_desc,
                &audit_commands,
                &msg,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ));
        }
    }

    audit::log_success(&state.db, "port_group_create", &audit_desc, &audit_commands).await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Port group '{}' created", body.name),
    }))
}

/// DELETE /api/v1/vyos/firewall/groups/port-group/:name — delete a port group.
pub async fn delete_port_group(
    State(state): State<AppState>,
    Path(name): Path<String>,
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

    tracing::info!("VyOS: deleting port-group '{name}'");

    let description = format!("Delete port group '{name}'");
    let commands = vec![format!("delete firewall group port-group {name}")];

    match client
        .configure_delete(&["firewall", "group", "port-group", &name])
        .await
    {
        Ok(_) => {
            audit::log_success(&state.db, "port_group_delete", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Port group '{name}' deleted"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS port-group delete failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "port_group_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/firewall/groups/port-group/:name/members — add a member.
pub async fn add_port_group_member(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<AddGroupMemberRequest>,
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

    if !is_valid_port_entry(&body.value) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: format!("Invalid port or port range: {}", body.value),
            }),
        ));
    }

    tracing::info!("VyOS: adding port '{}' to port-group '{name}'", body.value);

    let description = format!("Add port '{}' to port group '{name}'", body.value);
    let commands = vec![format!(
        "set firewall group port-group {name} port {}",
        body.value
    )];

    match client
        .configure_set(&[
            "firewall",
            "group",
            "port-group",
            &name,
            "port",
            &body.value,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(&state.db, "port_group_member_add", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Port '{}' added to group '{name}'", body.value),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS port-group member add failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "port_group_member_add",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// DELETE /api/v1/vyos/firewall/groups/port-group/:name/members/:value — remove a member.
pub async fn remove_port_group_member(
    State(state): State<AppState>,
    Path((name, value)): Path<(String, String)>,
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

    tracing::info!("VyOS: removing port '{value}' from port-group '{name}'");

    let description = format!("Remove port '{value}' from port group '{name}'");
    let commands = vec![format!(
        "delete firewall group port-group {name} port {value}"
    )];

    match client
        .configure_delete(&["firewall", "group", "port-group", &name, "port", &value])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "port_group_member_remove",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Port '{value}' removed from group '{name}'"),
            }))
        }
        Err(e) => {
            tracing::error!("VyOS port-group member remove failed: {e}");
            let msg = format!("VyOS error: {e}");
            audit::log_failure(
                &state.db,
                "port_group_member_remove",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
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

    // Check that Ookla Speedtest CLI is installed and executable
    match tokio::fs::metadata("/usr/local/bin/speedtest").await {
        Err(_) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(SpeedTestError {
                    error: "Ookla Speedtest CLI not installed on server. \
                            Install it or rebuild the Docker image."
                        .to_string(),
                }),
            ));
        }
        Ok(meta) => {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o111 == 0 {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(SpeedTestError {
                        error: "Ookla Speedtest CLI exists but is not executable".to_string(),
                    }),
                ));
            }
        }
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

// ── WireGuard VPN management ──────────────────────────────────────────────────

/// A WireGuard peer parsed from VyOS config.
#[derive(Debug, Clone, Serialize)]
pub struct WireguardPeer {
    pub name: String,
    pub public_key: Option<String>,
    pub allowed_ips: Vec<String>,
    pub endpoint: Option<String>,
    pub persistent_keepalive: Option<u32>,
}

/// A WireGuard interface parsed from VyOS config + operational status.
#[derive(Debug, Clone, Serialize)]
pub struct WireguardInterface {
    pub name: String,
    pub address: Option<String>,
    pub port: Option<u32>,
    pub public_key: Option<String>,
    pub peers: Vec<WireguardPeer>,
}

/// Response for keypair generation.
#[derive(Debug, Serialize)]
pub struct WireguardKeyPair {
    pub private_key: String,
    pub public_key: String,
}

/// Request body for creating a WireGuard interface.
#[derive(Debug, Deserialize)]
pub struct CreateWireguardInterfaceRequest {
    /// Interface name, e.g. "wg0"
    pub name: String,
    /// Listen port, e.g. 51820
    pub port: u16,
    /// Subnet address in CIDR notation, e.g. "10.10.20.1/24"
    pub address: String,
}

/// Request body for adding a peer to a WireGuard interface.
#[derive(Debug, Deserialize)]
pub struct AddWireguardPeerRequest {
    /// Peer name (used in VyOS config), e.g. "CLIENT1"
    pub name: String,
    /// Peer's public key (base64)
    pub public_key: String,
    /// Allowed IPs for this peer, e.g. "10.10.20.2/32"
    pub allowed_ips: String,
    /// Persistent keepalive interval in seconds (optional)
    pub persistent_keepalive: Option<u32>,
}

/// Request body for generating a client config.
#[derive(Debug, Deserialize)]
pub struct GenerateClientConfigRequest {
    /// Client's allowed IP address in CIDR, e.g. "10.10.20.2/32"
    pub client_address: String,
    /// DNS server for the client, e.g. "10.10.0.1"
    pub dns: Option<String>,
    /// Endpoint (router WAN IP:port). If not provided, uses router's
    /// configured public address + port.
    pub endpoint: Option<String>,
    /// Allowed IPs for the client-side config (default "0.0.0.0/0, ::/0")
    pub allowed_ips: Option<String>,
}

/// Response for client config generation.
#[derive(Debug, Serialize)]
pub struct ClientConfigResponse {
    pub config: String,
    pub private_key: String,
    pub public_key: String,
}

/// GET /api/v1/vyos/wireguard — list all WireGuard interfaces with peers.
pub async fn wireguard_list(
    State(state): State<AppState>,
) -> Result<Json<Vec<WireguardInterface>>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;

    let config = client
        .retrieve(&["interfaces", "wireguard"])
        .await
        .map_err(|e| {
            tracing::error!("VyOS wireguard config query failed: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    let interfaces = parse_wireguard_config(&config);
    Ok(Json(interfaces))
}

/// Parse VyOS wireguard configuration JSON into a list of interfaces.
fn parse_wireguard_config(config: &Value) -> Vec<WireguardInterface> {
    let mut interfaces = Vec::new();

    let obj = match config.as_object() {
        Some(o) => o,
        None => return interfaces,
    };

    for (iface_name, iface_val) in obj {
        let iface_obj = match iface_val.as_object() {
            Some(o) => o,
            None => continue,
        };

        let address = iface_obj.get("address").and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if let Some(arr) = v.as_array() {
                arr.first().and_then(|a| a.as_str().map(|s| s.to_string()))
            } else {
                None
            }
        });

        let port = iface_obj.get("port").and_then(|v| {
            v.as_u64()
                .map(|n| n as u32)
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        });

        // Get public key from private-key config or from operational data
        // VyOS stores private-key in config; public key is derived
        let public_key = iface_obj
            .get("public-key")
            .and_then(|v| v.as_str().map(|s| s.to_string()));

        // Parse peers
        let mut peers = Vec::new();
        if let Some(peer_map) = iface_obj.get("peer").and_then(|v| v.as_object()) {
            for (peer_name, peer_val) in peer_map {
                let peer_obj = match peer_val.as_object() {
                    Some(o) => o,
                    None => continue,
                };

                let pk = peer_obj
                    .get("public-key")
                    .and_then(|v| v.as_str().map(|s| s.to_string()));

                let allowed_ips = peer_obj
                    .get("allowed-ips")
                    .map(|v| {
                        if let Some(s) = v.as_str() {
                            vec![s.to_string()]
                        } else if let Some(arr) = v.as_array() {
                            arr.iter()
                                .filter_map(|a| a.as_str().map(|s| s.to_string()))
                                .collect()
                        } else {
                            Vec::new()
                        }
                    })
                    .unwrap_or_default();

                let endpoint = peer_obj
                    .get("endpoint")
                    .and_then(|v| v.as_str().map(|s| s.to_string()));

                let persistent_keepalive = peer_obj.get("persistent-keepalive").and_then(|v| {
                    v.as_u64()
                        .map(|n| n as u32)
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                });

                peers.push(WireguardPeer {
                    name: peer_name.clone(),
                    public_key: pk,
                    allowed_ips,
                    endpoint,
                    persistent_keepalive,
                });
            }
        }

        interfaces.push(WireguardInterface {
            name: iface_name.clone(),
            address,
            port,
            public_key,
            peers,
        });
    }

    interfaces
}

/// Validate a WireGuard interface name (wg0, wg1, ...).
fn is_valid_wg_name(name: &str) -> bool {
    if !name.starts_with("wg") {
        return false;
    }
    let suffix = &name[2..];
    !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit())
}

/// Validate a peer name (alphanumeric, hyphens, underscores).
fn is_valid_peer_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// POST /api/v1/vyos/wireguard — create a WireGuard interface.
///
/// Generates a keypair via VyOS, sets address, port, and private key.
pub async fn wireguard_create(
    State(state): State<AppState>,
    Json(body): Json<CreateWireguardInterfaceRequest>,
) -> Result<Json<WireguardKeyPair>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    // Validate interface name
    if !is_valid_wg_name(&body.name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid interface name. Use wg0, wg1, etc.".to_string(),
            }),
        ));
    }

    // Validate address CIDR
    if !is_valid_cidr(&body.address) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid address. Expected CIDR format like 10.10.20.1/24".to_string(),
            }),
        ));
    }

    // Validate port
    if body.port == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Port must be greater than 0".to_string(),
            }),
        ));
    }

    let description = format!(
        "Create WireGuard interface {} ({}:{}) ",
        body.name, body.address, body.port
    );

    // Generate WireGuard keypair via VyOS
    let keypair_result = client.generate(&["wireguard", "key-pair"]).await;

    let keypair_text = match keypair_result {
        Ok(val) => val.as_str().unwrap_or("").to_string(),
        Err(e) => {
            // Fallback: try the pki path (VyOS 1.4+)
            match client.generate(&["pki", "wireguard", "key-pair"]).await {
                Ok(val) => val.as_str().unwrap_or("").to_string(),
                Err(e2) => {
                    let msg = format!("Failed to generate keypair: {e} / {e2}");
                    tracing::error!("{msg}");
                    audit::log_failure(
                        &state.db,
                        "wireguard_interface_create",
                        &description,
                        &[],
                        &msg,
                    )
                    .await;
                    return Err((
                        StatusCode::BAD_GATEWAY,
                        Json(VyosWriteResponse {
                            success: false,
                            message: msg,
                        }),
                    ));
                }
            }
        }
    };

    // Parse the keypair output: "Private key: <key>\nPublic key: <key>"
    let (private_key, public_key) = parse_wireguard_keypair(&keypair_text).map_err(|e| {
        let msg = format!("Failed to parse keypair output: {e}");
        tracing::error!("{msg}");
        (
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        )
    })?;

    let port_str = body.port.to_string();
    let commands = vec![
        format!(
            "set interfaces wireguard {} address {}",
            body.name, body.address
        ),
        format!("set interfaces wireguard {} port {}", body.name, body.port),
        format!("set interfaces wireguard {} private-key ***", body.name),
    ];

    // Set address
    if let Err(e) = client
        .configure_set(&[
            "interfaces",
            "wireguard",
            &body.name,
            "address",
            &body.address,
        ])
        .await
    {
        let msg = format!("Failed to set WG address: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_interface_create",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Set port
    if let Err(e) = client
        .configure_set(&["interfaces", "wireguard", &body.name, "port", &port_str])
        .await
    {
        let msg = format!("Failed to set WG port: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_interface_create",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Set private key (goes directly to VyOS config, never stored in Panoptikon)
    if let Err(e) = client
        .configure_set(&[
            "interfaces",
            "wireguard",
            &body.name,
            "private-key",
            &private_key,
        ])
        .await
    {
        let msg = format!("Failed to set WG private key: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_interface_create",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    audit::log_success(
        &state.db,
        "wireguard_interface_create",
        &description,
        &commands,
    )
    .await;

    Ok(Json(WireguardKeyPair {
        private_key: "***".to_string(), // Never return the server private key
        public_key,
    }))
}

/// Parse "Private key: <key>\nPublic key: <key>" output from VyOS.
fn parse_wireguard_keypair(text: &str) -> Result<(String, String), String> {
    let mut private_key = None;
    let mut public_key = None;

    for line in text.lines() {
        let line = line.trim();
        if let Some(key) = line
            .strip_prefix("Private key:")
            .or_else(|| line.strip_prefix("private-key:"))
            .or_else(|| line.strip_prefix("PrivateKey:"))
        {
            private_key = Some(key.trim().to_string());
        } else if let Some(key) = line
            .strip_prefix("Public key:")
            .or_else(|| line.strip_prefix("public-key:"))
            .or_else(|| line.strip_prefix("PublicKey:"))
        {
            public_key = Some(key.trim().to_string());
        }
    }

    match (private_key, public_key) {
        (Some(priv_k), Some(pub_k)) if !priv_k.is_empty() && !pub_k.is_empty() => {
            Ok((priv_k, pub_k))
        }
        _ => Err(format!(
            "Could not parse private/public keys from output: {:?}",
            text
        )),
    }
}

/// DELETE /api/v1/vyos/wireguard/:name — delete a WireGuard interface.
pub async fn wireguard_delete(
    State(state): State<AppState>,
    Path(name): Path<String>,
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

    if !is_valid_wg_name(&name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid interface name".to_string(),
            }),
        ));
    }

    let description = format!("Delete WireGuard interface {}", name);
    let commands = vec![format!("delete interfaces wireguard {}", name)];

    tracing::info!("VyOS: deleting WireGuard interface {}", name);

    match client
        .configure_delete(&["interfaces", "wireguard", &name])
        .await
    {
        Ok(_) => {
            audit::log_success(
                &state.db,
                "wireguard_interface_delete",
                &description,
                &commands,
            )
            .await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("WireGuard interface {} deleted", name),
            }))
        }
        Err(e) => {
            let msg = format!("Failed to delete WireGuard interface: {e}");
            audit::log_failure(
                &state.db,
                "wireguard_interface_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// Path parameters for peer endpoints.
#[derive(Debug, Deserialize)]
pub struct WireguardPeerPath {
    pub name: String,
    pub peer: String,
}

/// POST /api/v1/vyos/wireguard/:name/peers — add a peer to a WireGuard interface.
pub async fn wireguard_add_peer(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<AddWireguardPeerRequest>,
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

    if !is_valid_wg_name(&name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid interface name".to_string(),
            }),
        ));
    }

    if !is_valid_peer_name(&body.name) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message:
                    "Invalid peer name. Use alphanumeric characters, hyphens, and underscores."
                        .to_string(),
            }),
        ));
    }

    if body.public_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Public key is required".to_string(),
            }),
        ));
    }

    // Validate allowed_ips as CIDR
    if !is_valid_cidr(&body.allowed_ips) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(VyosWriteResponse {
                success: false,
                message: "Invalid allowed IPs. Expected CIDR format like 10.10.20.2/32".to_string(),
            }),
        ));
    }

    let description = format!(
        "Add peer {} to WireGuard interface {} (allowed-ips: {})",
        body.name, name, body.allowed_ips
    );
    let commands = vec![
        format!(
            "set interfaces wireguard {} peer {} public-key {}",
            name, body.name, body.public_key
        ),
        format!(
            "set interfaces wireguard {} peer {} allowed-ips {}",
            name, body.name, body.allowed_ips
        ),
    ];

    tracing::info!(
        "VyOS: adding peer {} to WireGuard interface {}",
        body.name,
        name
    );

    // Set public key
    if let Err(e) = client
        .configure_set(&[
            "interfaces",
            "wireguard",
            &name,
            "peer",
            &body.name,
            "public-key",
            &body.public_key,
        ])
        .await
    {
        let msg = format!("Failed to set peer public key: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_peer_add",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Set allowed-ips
    if let Err(e) = client
        .configure_set(&[
            "interfaces",
            "wireguard",
            &name,
            "peer",
            &body.name,
            "allowed-ips",
            &body.allowed_ips,
        ])
        .await
    {
        let msg = format!("Failed to set peer allowed-ips: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_peer_add",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // Set persistent-keepalive if provided
    if let Some(keepalive) = body.persistent_keepalive {
        let keepalive_str = keepalive.to_string();
        let _ = client
            .configure_set(&[
                "interfaces",
                "wireguard",
                &name,
                "peer",
                &body.name,
                "persistent-keepalive",
                &keepalive_str,
            ])
            .await;
    }

    audit::log_success(&state.db, "wireguard_peer_add", &description, &commands).await;

    Ok(Json(VyosWriteResponse {
        success: true,
        message: format!("Peer {} added to {}", body.name, name),
    }))
}

/// DELETE /api/v1/vyos/wireguard/:name/peers/:peer — delete a peer from a WireGuard interface.
pub async fn wireguard_delete_peer(
    State(state): State<AppState>,
    Path(params): Path<WireguardPeerPath>,
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

    let description = format!(
        "Delete peer {} from WireGuard interface {}",
        params.peer, params.name
    );
    let commands = vec![format!(
        "delete interfaces wireguard {} peer {}",
        params.name, params.peer
    )];

    tracing::info!(
        "VyOS: deleting peer {} from WireGuard interface {}",
        params.peer,
        params.name
    );

    match client
        .configure_delete(&[
            "interfaces",
            "wireguard",
            &params.name,
            "peer",
            &params.peer,
        ])
        .await
    {
        Ok(_) => {
            audit::log_success(&state.db, "wireguard_peer_delete", &description, &commands).await;
            Ok(Json(VyosWriteResponse {
                success: true,
                message: format!("Peer {} deleted from {}", params.peer, params.name),
            }))
        }
        Err(e) => {
            let msg = format!("Failed to delete peer: {e}");
            audit::log_failure(
                &state.db,
                "wireguard_peer_delete",
                &description,
                &commands,
                &msg,
            )
            .await;
            Err((
                StatusCode::BAD_GATEWAY,
                Json(VyosWriteResponse {
                    success: false,
                    message: msg,
                }),
            ))
        }
    }
}

/// POST /api/v1/vyos/wireguard/generate-keypair — generate a WireGuard keypair.
pub async fn wireguard_generate_keypair(
    State(state): State<AppState>,
) -> Result<Json<WireguardKeyPair>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    // Try both VyOS 1.3 and 1.4+ paths
    let keypair_text = match client.generate(&["wireguard", "key-pair"]).await {
        Ok(val) => val.as_str().unwrap_or("").to_string(),
        Err(_) => match client.generate(&["pki", "wireguard", "key-pair"]).await {
            Ok(val) => val.as_str().unwrap_or("").to_string(),
            Err(e) => {
                return Err((
                    StatusCode::BAD_GATEWAY,
                    Json(VyosWriteResponse {
                        success: false,
                        message: format!("Failed to generate keypair: {e}"),
                    }),
                ));
            }
        },
    };

    let (private_key, public_key) = parse_wireguard_keypair(&keypair_text).map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    Ok(Json(WireguardKeyPair {
        private_key,
        public_key,
    }))
}

/// POST /api/v1/vyos/wireguard/:name/peers/:peer/generate-config — generate client config.
///
/// Generates a new client keypair, sets the client's public key in the peer config,
/// and returns the complete client configuration file content.
pub async fn wireguard_generate_client_config(
    State(state): State<AppState>,
    Path(params): Path<WireguardPeerPath>,
    Json(body): Json<GenerateClientConfigRequest>,
) -> Result<Json<ClientConfigResponse>, (StatusCode, Json<VyosWriteResponse>)> {
    let client = get_vyos_client_or_503(&state).await.map_err(|_| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(VyosWriteResponse {
                success: false,
                message: "Router not configured".to_string(),
            }),
        )
    })?;

    // 1. Generate client keypair
    let keypair_text = match client.generate(&["wireguard", "key-pair"]).await {
        Ok(val) => val.as_str().unwrap_or("").to_string(),
        Err(_) => match client.generate(&["pki", "wireguard", "key-pair"]).await {
            Ok(val) => val.as_str().unwrap_or("").to_string(),
            Err(e) => {
                return Err((
                    StatusCode::BAD_GATEWAY,
                    Json(VyosWriteResponse {
                        success: false,
                        message: format!("Failed to generate client keypair: {e}"),
                    }),
                ));
            }
        },
    };

    let (client_private, client_public) = parse_wireguard_keypair(&keypair_text).map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: e,
            }),
        )
    })?;

    // 2. Set client public key in peer config
    let description = format!(
        "Generate client config for peer {} on {}",
        params.peer, params.name
    );
    let commands = vec![format!(
        "set interfaces wireguard {} peer {} public-key {}",
        params.name, params.peer, client_public
    )];

    if let Err(e) = client
        .configure_set(&[
            "interfaces",
            "wireguard",
            &params.name,
            "peer",
            &params.peer,
            "public-key",
            &client_public,
        ])
        .await
    {
        let msg = format!("Failed to set client public key in peer config: {e}");
        audit::log_failure(
            &state.db,
            "wireguard_client_config_generate",
            &description,
            &commands,
            &msg,
        )
        .await;
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(VyosWriteResponse {
                success: false,
                message: msg,
            }),
        ));
    }

    // 3. Get the router's public key + port from config
    let wg_config = client
        .retrieve(&["interfaces", "wireguard", &params.name])
        .await
        .unwrap_or(Value::Null);

    let router_public_key = wg_config
        .as_object()
        .and_then(|o| o.get("public-key"))
        .and_then(|v| v.as_str())
        .unwrap_or("ROUTER_PUBLIC_KEY_NOT_FOUND")
        .to_string();

    let router_port = wg_config
        .as_object()
        .and_then(|o| o.get("port"))
        .and_then(|v| {
            v.as_u64()
                .map(|n| n.to_string())
                .or_else(|| v.as_str().map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "51820".to_string());

    // 4. Build the client config
    let endpoint = body
        .endpoint
        .unwrap_or_else(|| format!("YOUR_SERVER_IP:{}", router_port));
    let dns = body.dns.unwrap_or_else(|| "1.1.1.1".to_string());
    let allowed_ips = body
        .allowed_ips
        .unwrap_or_else(|| "0.0.0.0/0, ::/0".to_string());

    let config = format!(
        "[Interface]\nPrivateKey = {}\nAddress = {}\nDNS = {}\n\n[Peer]\nPublicKey = {}\nAllowedIPs = {}\nEndpoint = {}\nPersistentKeepalive = 25\n",
        client_private, body.client_address, dns, router_public_key, allowed_ips, endpoint
    );

    audit::log_success(
        &state.db,
        "wireguard_client_config_generate",
        &description,
        &commands,
    )
    .await;

    Ok(Json(ClientConfigResponse {
        config,
        private_key: client_private,
        public_key: client_public,
    }))
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

    // ── Firewall groups parsing ─────────────────────────────

    #[test]
    fn test_parse_firewall_groups_full() {
        let json: Value = serde_json::from_str(
            r#"{
                "address-group": {
                    "BLOCKED_IPS": {
                        "address": ["1.2.3.4", "5.6.7.8"],
                        "description": "Blocked addresses"
                    },
                    "SINGLE": {
                        "address": "10.0.0.1"
                    }
                },
                "network-group": {
                    "TRUSTED_NETS": {
                        "network": ["10.0.0.0/8", "172.16.0.0/12"],
                        "description": "Trusted networks"
                    }
                },
                "port-group": {
                    "WEB_PORTS": {
                        "port": ["80", "443", "8080-8090"],
                        "description": "Web ports"
                    }
                }
            }"#,
        )
        .unwrap();

        let groups = parse_firewall_groups(&json);

        assert_eq!(groups.address_groups.len(), 2);
        assert_eq!(groups.address_groups[0].name, "BLOCKED_IPS");
        assert_eq!(
            groups.address_groups[0].description.as_deref(),
            Some("Blocked addresses")
        );
        assert_eq!(groups.address_groups[0].members, vec!["1.2.3.4", "5.6.7.8"]);
        assert_eq!(groups.address_groups[1].name, "SINGLE");
        assert_eq!(groups.address_groups[1].members, vec!["10.0.0.1"]);

        assert_eq!(groups.network_groups.len(), 1);
        assert_eq!(groups.network_groups[0].name, "TRUSTED_NETS");
        assert_eq!(
            groups.network_groups[0].members,
            vec!["10.0.0.0/8", "172.16.0.0/12"]
        );

        assert_eq!(groups.port_groups.len(), 1);
        assert_eq!(groups.port_groups[0].name, "WEB_PORTS");
        assert_eq!(
            groups.port_groups[0].members,
            vec!["80", "443", "8080-8090"]
        );
    }

    #[test]
    fn test_parse_firewall_groups_empty() {
        let json: Value = serde_json::from_str("{}").unwrap();
        let groups = parse_firewall_groups(&json);
        assert!(groups.address_groups.is_empty());
        assert!(groups.network_groups.is_empty());
        assert!(groups.port_groups.is_empty());

        let groups2 = parse_firewall_groups(&Value::Null);
        assert!(groups2.address_groups.is_empty());
    }

    #[test]
    fn test_parse_firewall_groups_numeric_port() {
        let json: Value = serde_json::from_str(
            r#"{
                "port-group": {
                    "SINGLE_PORT": {
                        "port": 443
                    }
                }
            }"#,
        )
        .unwrap();

        let groups = parse_firewall_groups(&json);
        assert_eq!(groups.port_groups.len(), 1);
        assert_eq!(groups.port_groups[0].members, vec!["443"]);
    }

    // ── Validation helpers ────────────────────────────────────

    #[test]
    fn test_validate_group_name() {
        assert!(validate_group_name("BLOCKED_IPS").is_ok());
        assert!(validate_group_name("my-group-1").is_ok());
        assert!(validate_group_name("").is_err());
        assert!(validate_group_name("bad name").is_err());
        assert!(validate_group_name("bad/name").is_err());
    }

    #[test]
    fn test_is_valid_cidr() {
        assert!(is_valid_cidr("10.0.0.0/8"));
        assert!(is_valid_cidr("192.168.1.0/24"));
        assert!(is_valid_cidr("0.0.0.0/0"));
        assert!(!is_valid_cidr("10.0.0.0"));
        assert!(!is_valid_cidr("10.0.0.0/33"));
        assert!(!is_valid_cidr("invalid/8"));
    }

    #[test]
    fn test_is_valid_port_entry() {
        assert!(is_valid_port_entry("80"));
        assert!(is_valid_port_entry("443"));
        assert!(is_valid_port_entry("8080-8090"));
        assert!(!is_valid_port_entry("0"));
        assert!(!is_valid_port_entry("abc"));
        assert!(!is_valid_port_entry("8090-8080")); // start > end
        assert!(!is_valid_port_entry(""));
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

    // ── Firewall CRUD helpers ─────────────────────────────

    #[test]
    fn test_parse_chain_path_valid() {
        let parts = parse_chain_path("ipv4.forward.filter").unwrap();
        assert_eq!(parts, vec!["ipv4", "forward", "filter"]);

        let parts = parse_chain_path("ipv6.input.raw").unwrap();
        assert_eq!(parts, vec!["ipv6", "input", "raw"]);

        let parts = parse_chain_path("ipv4.output.filter").unwrap();
        assert_eq!(parts, vec!["ipv4", "output", "filter"]);
    }

    #[test]
    fn test_parse_chain_path_invalid() {
        assert!(parse_chain_path("").is_err());
        assert!(parse_chain_path("ipv4.forward").is_err());
        assert!(parse_chain_path("ipv4.forward.filter.extra").is_err());
        assert!(parse_chain_path("ipv5.forward.filter").is_err());
        assert!(parse_chain_path("ipv4.sideways.filter").is_err());
    }

    #[test]
    fn test_firewall_rule_base_path() {
        let parts = vec!["ipv4", "forward", "filter"];
        let base = firewall_rule_base_path(&parts, 100);
        assert_eq!(
            base,
            vec!["firewall", "ipv4", "forward", "filter", "rule", "100"]
        );
    }

    #[test]
    fn test_validate_firewall_rule_valid() {
        let rule = FirewallRuleRequest {
            number: 100,
            action: "drop".to_string(),
            protocol: Some("tcp".to_string()),
            source_address: Some("10.0.0.0/8".to_string()),
            source_port: Some("1024-65535".to_string()),
            destination_address: Some("192.168.1.1".to_string()),
            destination_port: Some("443".to_string()),
            description: Some("Test rule".to_string()),
            state: Some(vec!["new".to_string(), "established".to_string()]),
            disabled: false,
        };
        assert!(validate_firewall_rule(&rule).is_ok());
    }

    #[test]
    fn test_validate_firewall_rule_invalid_action() {
        let rule = FirewallRuleRequest {
            number: 10,
            action: "allow".to_string(), // invalid
            protocol: None,
            source_address: None,
            source_port: None,
            destination_address: None,
            destination_port: None,
            description: None,
            state: None,
            disabled: false,
        };
        assert!(validate_firewall_rule(&rule).is_err());
    }

    #[test]
    fn test_validate_firewall_rule_invalid_number() {
        let rule = FirewallRuleRequest {
            number: 0, // invalid
            action: "drop".to_string(),
            protocol: None,
            source_address: None,
            source_port: None,
            destination_address: None,
            destination_port: None,
            description: None,
            state: None,
            disabled: false,
        };
        assert!(validate_firewall_rule(&rule).is_err());
    }

    #[test]
    fn test_validate_firewall_rule_invalid_protocol() {
        let rule = FirewallRuleRequest {
            number: 10,
            action: "drop".to_string(),
            protocol: Some("http".to_string()), // invalid
            source_address: None,
            source_port: None,
            destination_address: None,
            destination_port: None,
            description: None,
            state: None,
            disabled: false,
        };
        assert!(validate_firewall_rule(&rule).is_err());
    }

    #[test]
    fn test_validate_firewall_rule_invalid_state() {
        let rule = FirewallRuleRequest {
            number: 10,
            action: "accept".to_string(),
            protocol: None,
            source_address: None,
            source_port: None,
            destination_address: None,
            destination_port: None,
            description: None,
            state: Some(vec!["bogus".to_string()]),
            disabled: false,
        };
        assert!(validate_firewall_rule(&rule).is_err());
    }

    #[test]
    fn test_is_valid_ip_or_cidr() {
        assert!(is_valid_ip_or_cidr("10.0.0.0/8"));
        assert!(is_valid_ip_or_cidr("192.168.1.1"));
        assert!(is_valid_ip_or_cidr("!10.0.0.0/8")); // negation
        assert!(is_valid_ip_or_cidr("::1"));
        assert!(is_valid_ip_or_cidr("fe80::1/64"));
        assert!(!is_valid_ip_or_cidr(""));
        assert!(!is_valid_ip_or_cidr("not-an-ip"));
        assert!(!is_valid_ip_or_cidr("10.0.0.0/999"));
    }

    #[test]
    fn test_is_valid_port() {
        assert!(is_valid_port("80"));
        assert!(is_valid_port("443"));
        assert!(is_valid_port("1024-65535"));
        assert!(is_valid_port("80,443"));
        assert!(!is_valid_port(""));
        assert!(!is_valid_port("abc"));
        assert!(!is_valid_port("99999"));
    }

    #[test]
    fn test_parse_firewall_disabled_rule() {
        let json: Value = serde_json::from_str(
            r#"{
                "ipv4": {
                    "forward": {
                        "filter": {
                            "default-action": "drop",
                            "rule": {
                                "10": {
                                    "action": "accept",
                                    "description": "Enabled rule"
                                },
                                "20": {
                                    "action": "drop",
                                    "disable": "",
                                    "description": "Disabled rule"
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
        assert_eq!(config.chains[0].rules.len(), 2);
        assert!(!config.chains[0].rules[0].disabled);
        assert!(config.chains[0].rules[1].disabled);
    }

    #[test]
    fn test_parse_firewall_chain_path() {
        let json: Value = serde_json::from_str(
            r#"{
                "ipv4": {
                    "forward": {
                        "filter": {
                            "default-action": "accept"
                        }
                    }
                }
            }"#,
        )
        .unwrap();

        let config = parse_firewall_config(&json);
        assert_eq!(config.chains.len(), 1);
        assert_eq!(config.chains[0].path, vec!["ipv4", "forward", "filter"]);
    }
}
