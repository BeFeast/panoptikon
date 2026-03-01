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

/// Inner graph object containing nodes (and optionally leafs).
#[derive(Debug, Deserialize)]
struct XiaomiTopoGraph {
    #[serde(default)]
    nodes: Vec<XiaomiTopoNode>,
}

/// Root response from `api/misystem/topo_graph`.
///
/// The actual Xiaomi response nests the node list inside `graph.nodes`,
/// **not** at the top-level `list` key.
#[derive(Debug, Deserialize)]
struct XiaomiTopoResponse {
    code: i32,
    #[serde(default)]
    graph: Option<XiaomiTopoGraph>,
}

/// A single node in the Xiaomi mesh topology.
#[derive(Debug, Deserialize)]
struct XiaomiTopoNode {
    #[serde(default)]
    ip: String,
    #[serde(default)]
    mac: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    hardware: String,
    #[serde(default)]
    locale: String,
    /// 1 = main/CAP node, 0 = satellite
    #[serde(default)]
    is_ap: i32,
    /// Number of online devices connected to this node.
    #[serde(default)]
    online: i32,
    /// Connection type: "wire" or "wifi", etc.
    #[serde(default, rename = "type")]
    connection_type: String,
    /// Parent node MAC address (empty for the main/CAP node).
    #[serde(default)]
    parent_mac: String,
    /// Signal strength (for wireless backhaul, otherwise 0).
    #[serde(default)]
    signal: i32,
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
        AppError::BadGateway(format!(
            "Could not reach Xiaomi mesh router at {router_ip}. Check the router IP in Settings \u{2192} Xiaomi Mesh."
        ))
    })?;

    if !resp.status().is_success() {
        warn!(
            "mesh topology endpoint returned HTTP {}",
            resp.status().as_u16()
        );
        return Err(AppError::BadGateway(format!(
            "Xiaomi mesh router at {router_ip} returned an error. Verify the router is a Xiaomi mesh device."
        )));
    }

    let raw: XiaomiTopoResponse = resp.json().await.map_err(|e| {
        warn!("failed to parse mesh topology response: {e}");
        AppError::BadGateway(format!(
            "Invalid response from Xiaomi mesh router at {router_ip}. The device may not be a supported Xiaomi mesh router."
        ))
    })?;

    if raw.code != 0 {
        warn!("mesh topology returned error code {}", raw.code);
        return Err(AppError::BadGateway(format!(
            "Xiaomi mesh router at {router_ip} returned error code {}.",
            raw.code
        )));
    }

    let topo_nodes = raw.graph.map(|g| g.nodes).unwrap_or_default();

    let mut total_devices = 0i32;
    let nodes: Vec<MeshNode> = topo_nodes
        .into_iter()
        .map(|n| {
            total_devices += n.online;
            let backhaul_type = if n.is_ap == 1 {
                "main".to_string()
            } else if n.connection_type == "wire" {
                "wired".to_string()
            } else {
                n.connection_type.clone()
            };
            MeshNode {
                ip: n.ip.clone(),
                mac: n.mac,
                name: if n.name.is_empty() {
                    n.locale.clone()
                } else {
                    n.name
                },
                model: n.model,
                hardware: n.hardware,
                is_main: n.is_ap == 1,
                online_devices: n.online,
                backhaul_type,
                parent_mac: n.parent_mac,
                signal: n.signal,
                is_online: !n.ip.is_empty(),
            }
        })
        .collect();

    Ok(Json(MeshTopologyResponse {
        main_ip: router_ip,
        total_devices,
        nodes,
    }))
}
