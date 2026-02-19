use axum::{extract::State, http::StatusCode, Json};
use serde_json::Value;

use super::AppState;

/// GET /api/v1/vyos/interfaces — fetch VyOS interface information.
pub async fn interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client(&state)?;
    client.show(&["interfaces"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS interfaces query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/routes — fetch VyOS routing table.
pub async fn routes(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client(&state)?;
    client.show(&["ip", "route"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS routes query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/dhcp-leases — fetch DHCP server leases from VyOS.
pub async fn dhcp_leases(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client(&state)?;
    client
        .show(&["dhcp", "server", "leases"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS DHCP leases query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

/// GET /api/v1/vyos/firewall — fetch firewall rules from VyOS.
pub async fn firewall(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client(&state)?;
    client.show(&["firewall"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS firewall query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// Helper to construct a VyOS client from the app state config.
fn get_vyos_client(state: &AppState) -> Result<crate::vyos::client::VyosClient, StatusCode> {
    let url = state
        .config
        .vyos
        .url
        .as_deref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let api_key = state
        .config
        .vyos
        .api_key
        .as_deref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(crate::vyos::client::VyosClient::new(url, api_key))
}
