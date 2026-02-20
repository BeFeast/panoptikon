use axum::{extract::State, http::StatusCode, Json};

use super::AppState;

/// POST /api/v1/scanner/trigger — trigger an immediate ARP scan.
pub async fn trigger(
    State(state): State<AppState>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    let subnets = &state.config.scanner.subnets;
    let arp_settle = state.config.scanner.arp_settle_millis;
    let grace = state.config.scanner.offline_grace_seconds;

    let discovered = crate::scanner::scan_subnets(subnets, arp_settle)
        .await
        .map_err(|e| {
            tracing::error!("Manual scan failed: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Scan failed: {e}")})),
            )
        })?;

    tracing::info!(count = discovered.len(), "Manual ARP scan completed");

    crate::scanner::process_scan_results(&state.db, &discovered, grace, &state.ws_hub)
        .await
        .map_err(|e| {
            tracing::error!("Failed to process manual scan results: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("Failed to process results: {e}")})),
            )
        })?;

    Ok(StatusCode::NO_CONTENT)
}
