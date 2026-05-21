//! Xiaomi Mesh topology proxy endpoint.
//!
//! Fetches the mesh topology from the Xiaomi router's `api/misystem/topo_graph`
//! endpoint which requires **no authentication**. The router IP is read from the
//! `xiaomi_mesh_ip` setting (defaults to `10.10.0.199`).

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};
use tracing::warn;

use super::error::AppError;
use super::AppState;

// ── Settings helper ─────────────────────────────────────────

const DEFAULT_MESH_IP: &str = "10.10.0.199";

async fn mesh_router_ip(state: &AppState) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind("xiaomi_mesh_ip")
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_MESH_IP.to_string())
}

// ── Raw Xiaomi topo_graph response shapes ───────────────────

/// Root response from `api/misystem/topo_graph`.
#[derive(Debug, Deserialize)]
struct XiaomiTopoResponse {
    code: i32,
    #[serde(default)]
    graph: Option<XiaomiTopoGraph>,
}

/// The `graph` object represents the main router node with satellite nodes
/// nested inside the `leafs` array.
///
/// Real response shape (RD15 firmware 1.0.87):
/// ```json
/// {
///   "ip": "10.10.0.199",
///   "name": "OK Home",
///   "hardware": "RD15",
///   "mode": 2,
///   "onlines": "8",
///   "leafs": [ ... ]
/// }
/// ```
#[derive(Debug, Deserialize)]
struct XiaomiTopoGraph {
    #[serde(default)]
    ip: String,
    #[serde(default)]
    mac: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    locale: String,
    #[serde(default)]
    hardware: String,
    /// 2 = AP mode (main node), 1 = mesh satellite.
    #[serde(default)]
    #[allow(dead_code)]
    mode: i32,
    /// Number of online devices. May be a string or number in the JSON.
    #[serde(default)]
    onlines: serde_json::Value,
    #[serde(default)]
    leafs: Vec<XiaomiTopoLeaf>,
}

/// A satellite (leaf) node in the mesh topology.
#[derive(Debug, Deserialize)]
struct XiaomiTopoLeaf {
    #[serde(default)]
    ip: String,
    #[serde(default)]
    mac: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    locale: String,
    #[serde(default)]
    hardware: String,
    /// 1 = mesh satellite, 2 = AP mode.
    #[serde(default)]
    #[allow(dead_code)]
    mode: i32,
    /// Connection type: "wired" or "wireless".
    #[serde(default)]
    link_type: String,
    /// Number of online devices. May be a string or number in the JSON.
    #[serde(default)]
    onlines: serde_json::Value,
    /// Signal strength (0–2 or similar scale).
    #[serde(default)]
    signal: i32,
}

/// Parse `onlines` which may be a JSON number or string.
fn parse_onlines(v: &serde_json::Value) -> i32 {
    match v {
        serde_json::Value::Number(n) => n.as_i64().unwrap_or(0) as i32,
        serde_json::Value::String(s) => s.trim().parse::<i32>().unwrap_or(0),
        _ => 0,
    }
}

/// True for the Xiaomi locale placeholders (`default`, `node`, …) that the
/// firmware ships before the user gives a mesh node a real label — they
/// must not be treated as a display name.
fn is_placeholder_label(s: &str) -> bool {
    matches!(
        s.trim().to_ascii_lowercase().as_str(),
        "" | "default" | "node" | "router" | "mesh" | "unknown"
    )
}

/// Pick the best human-readable label for a mesh node. Prefer `name` (what the
/// user typed in the MiWiFi app for the device), fall back to `locale` only
/// when it's not a Xiaomi placeholder like `default`. Returns the first
/// non-placeholder candidate, or an empty string when neither qualifies.
fn pick_mesh_label(name: &str, locale: &str) -> String {
    if !is_placeholder_label(name) {
        return name.to_string();
    }
    if !is_placeholder_label(locale) {
        return locale.to_string();
    }
    String::new()
}

// ── API response types ──────────────────────────────────────

/// A mesh node returned to the frontend.
#[derive(Debug, Serialize)]
pub struct MeshNode {
    pub ip: String,
    pub mac: String,
    pub name: String,
    pub model: String,
    pub hardware: String,
    pub is_main: bool,
    pub online_devices: i32,
    pub backhaul_type: String,
    pub parent_mac: String,
    pub signal: i32,
    pub is_online: bool,
}

/// Full mesh topology response.
#[derive(Debug, Serialize)]
pub struct MeshTopologyResponse {
    pub nodes: Vec<MeshNode>,
    pub main_ip: String,
    pub total_devices: i32,
}

// ── Handler ─────────────────────────────────────────────────

/// GET /api/v1/mesh/topology
pub async fn topology(
    State(state): State<AppState>,
) -> Result<Json<MeshTopologyResponse>, AppError> {
    let router_ip = mesh_router_ip(&state).await;
    let url = format!("http://{router_ip}/cgi-bin/luci/api/misystem/topo_graph");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| {
            warn!("failed to build HTTP client for mesh: {e}");
            AppError::Internal("Failed to initialize HTTP client".to_string())
        })?;

    let resp = client.get(&url).send().await.map_err(|e| {
        warn!("failed to fetch mesh topology from {url}: {e}");
        AppError::ServiceUnavailable(format!(
            "Xiaomi mesh router at {router_ip} is not reachable. Check that the router IP is correct in Settings."
        ))
    })?;

    if !resp.status().is_success() {
        warn!(
            "mesh topology endpoint returned HTTP {}",
            resp.status().as_u16()
        );
        return Err(AppError::BadGateway(format!(
            "Xiaomi mesh router at {router_ip} returned an error (HTTP {})",
            resp.status().as_u16()
        )));
    }

    let raw: XiaomiTopoResponse = resp.json().await.map_err(|e| {
        warn!("failed to parse mesh topology response: {e}");
        AppError::BadGateway(format!(
            "Unexpected response from Xiaomi mesh router at {router_ip}"
        ))
    })?;

    if raw.code != 0 {
        warn!("mesh topology returned error code {}", raw.code);
        return Err(AppError::BadGateway(format!(
            "Xiaomi mesh router at {router_ip} returned error code {}",
            raw.code
        )));
    }

    let graph = match raw.graph {
        Some(g) => g,
        None => {
            return Ok(Json(MeshTopologyResponse {
                main_ip: router_ip,
                total_devices: 0,
                nodes: vec![],
            }));
        }
    };

    let mut total_devices = 0i32;
    let mut nodes = Vec::new();

    // Main router node (the graph root).
    let main_onlines = parse_onlines(&graph.onlines);
    total_devices += main_onlines;
    // Use MAC from API if available, otherwise fall back to IP for a unique ID.
    let main_mac = if !graph.mac.is_empty() {
        graph.mac.clone()
    } else {
        graph.ip.clone()
    };
    nodes.push(MeshNode {
        ip: graph.ip.clone(),
        mac: main_mac.clone(),
        name: pick_mesh_label(&graph.name, &graph.locale),
        model: String::new(),
        hardware: graph.hardware,
        is_main: true,
        online_devices: main_onlines,
        backhaul_type: "main".to_string(),
        parent_mac: String::new(),
        signal: 0,
        is_online: !graph.ip.is_empty(),
    });

    // Satellite (leaf) nodes.
    for leaf in graph.leafs {
        let leaf_onlines = parse_onlines(&leaf.onlines);
        total_devices += leaf_onlines;
        let backhaul_type = if leaf.link_type == "wired" || leaf.link_type == "wire" {
            "wired".to_string()
        } else if leaf.link_type.is_empty() {
            "unknown".to_string()
        } else {
            leaf.link_type
        };
        let leaf_mac = if !leaf.mac.is_empty() {
            leaf.mac.clone()
        } else {
            leaf.ip.clone()
        };
        nodes.push(MeshNode {
            ip: leaf.ip.clone(),
            mac: leaf_mac,
            name: pick_mesh_label(&leaf.name, &leaf.locale),
            model: String::new(),
            hardware: leaf.hardware,
            is_main: false,
            online_devices: leaf_onlines,
            backhaul_type,
            parent_mac: main_mac.clone(),
            signal: leaf.signal,
            is_online: !leaf.ip.is_empty(),
        });
    }

    Ok(Json(MeshTopologyResponse {
        main_ip: router_ip,
        total_devices,
        nodes,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn placeholder_label_detected_case_insensitively() {
        assert!(is_placeholder_label(""));
        assert!(is_placeholder_label("default"));
        assert!(is_placeholder_label("DEFAULT"));
        assert!(is_placeholder_label("  Default  "));
        assert!(is_placeholder_label("node"));
        assert!(is_placeholder_label("router"));
        assert!(is_placeholder_label("mesh"));
        assert!(is_placeholder_label("unknown"));

        assert!(!is_placeholder_label("Live Studio"));
        assert!(!is_placeholder_label("Basement"));
        assert!(!is_placeholder_label("master"));
        assert!(!is_placeholder_label("slave"));
    }

    #[test]
    fn pick_mesh_label_prefers_real_name_over_default_locale() {
        // The screenshot bug: BE3600 firmware returns locale="default" for
        // satellite nodes while the actual node label lives in `name`.
        // Picking the locale first collapses every node to "default".
        assert_eq!(pick_mesh_label("Live Studio", "default"), "Live Studio");
        assert_eq!(pick_mesh_label("Basement", "default"), "Basement");
        assert_eq!(pick_mesh_label("Floor 2", "default"), "Floor 2");
    }

    #[test]
    fn pick_mesh_label_falls_back_to_locale_when_name_is_placeholder() {
        // Older firmwares put the user-set label in `locale` (e.g. "master").
        assert_eq!(pick_mesh_label("", "master"), "master");
        assert_eq!(pick_mesh_label("default", "slave"), "slave");
        assert_eq!(pick_mesh_label("router", "OK Home"), "OK Home");
    }

    #[test]
    fn pick_mesh_label_returns_empty_when_both_are_placeholders() {
        assert_eq!(pick_mesh_label("default", "default"), "");
        assert_eq!(pick_mesh_label("", ""), "");
        assert_eq!(pick_mesh_label("router", "node"), "");
    }
}
