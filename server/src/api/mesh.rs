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
//
// On RD15 firmware (BE3600) the `api/misystem/topo_graph` endpoint returns
// the main router info *directly* in the `graph` object (no separate `nodes`
// array), with satellite mesh nodes listed under `graph.leafs`.

/// Deserialize an `i32` from either a JSON number or a JSON string.
/// Returns 0 for any other type.
fn de_i32_from_string_or_number<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match &value {
        serde_json::Value::Number(n) => Ok(n.as_i64().unwrap_or(0) as i32),
        serde_json::Value::String(s) => Ok(s.trim().parse::<i32>().unwrap_or(0)),
        _ => Ok(0),
    }
}

/// Root response from `api/misystem/topo_graph`.
#[derive(Debug, Deserialize)]
struct XiaomiTopoResponse {
    code: i32,
    #[serde(default)]
    graph: Option<XiaomiTopoGraphRoot>,
}

/// The `graph` object from `api/misystem/topo_graph`.
///
/// On RD15 firmware this object contains the main router's own fields
/// (ip, name, hardware, etc.) and a `leafs` array of satellite nodes.
#[derive(Debug, Deserialize)]
struct XiaomiTopoGraphRoot {
    #[serde(default)]
    ip: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    hardware: String,
    #[serde(default)]
    locale: String,
    /// Network mode: 2 = AP (main node), 1 = satellite repeater.
    #[serde(default)]
    mode: i32,
    /// Number of online devices (may be a number or a string).
    #[serde(default, deserialize_with = "de_i32_from_string_or_number")]
    onlines: i32,
    /// Satellite mesh nodes.
    #[serde(default)]
    leafs: Vec<XiaomiTopoLeaf>,
}

/// A satellite mesh node in the `graph.leafs` array.
#[derive(Debug, Deserialize)]
struct XiaomiTopoLeaf {
    #[serde(default)]
    ip: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    hardware: String,
    #[serde(default)]
    locale: String,
    #[serde(default)]
    mode: i32,
    /// Number of online devices connected to this satellite.
    #[serde(default)]
    onlines: i32,
    /// Connection type: "wired" or "wifi".
    #[serde(default)]
    link_type: String,
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

    let mut total_devices = graph.onlines;
    let mut nodes = Vec::with_capacity(1 + graph.leafs.len());

    // Main router node (the graph root itself).
    nodes.push(MeshNode {
        ip: graph.ip,
        mac: String::new(),
        name: if graph.name.is_empty() {
            graph.locale.clone()
        } else {
            graph.name
        },
        model: String::new(),
        hardware: graph.hardware,
        is_main: true,
        online_devices: graph.onlines,
        backhaul_type: "main".to_string(),
        parent_mac: String::new(),
        signal: 0,
        is_online: true,
    });

    // Satellite mesh nodes from leafs.
    for leaf in graph.leafs {
        total_devices += leaf.onlines;
        let backhaul_type = if leaf.link_type == "wired" || leaf.link_type == "wire" {
            "wired".to_string()
        } else if leaf.link_type.is_empty() {
            "unknown".to_string()
        } else {
            leaf.link_type
        };
        nodes.push(MeshNode {
            ip: leaf.ip.clone(),
            mac: String::new(),
            name: if leaf.name.is_empty() {
                leaf.locale.clone()
            } else {
                leaf.name
            },
            model: String::new(),
            hardware: leaf.hardware,
            is_main: false,
            online_devices: leaf.onlines,
            backhaul_type,
            parent_mac: String::new(),
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
