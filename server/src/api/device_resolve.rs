//! Device identity resolution endpoint.
//!
//! Allows manual triggering of device hostname resolution from
//! external sources (MikroTik DHCP leases, Xiaomi device list).

use axum::{extract::State, Json};

use super::AppState;
use crate::device_resolver;

/// POST /api/v1/devices/resolve — trigger device identity resolution.
///
/// Queries configured routers for DHCP hostnames and applies them
/// to devices that currently show as "Unknown Device".
pub async fn resolve(State(state): State<AppState>) -> Json<device_resolver::ResolveResult> {
    let result = device_resolver::resolve_devices(&state.db).await;
    Json(result)
}
