use axum::{extract::State, Json};

use super::{AppError, AppState};
use crate::scanner::ScanSummary;

/// POST /api/v1/scanner/trigger — trigger an immediate network scan.
///
/// Runs ARP discovery + all enabled enrichment sources (nmap, NetBIOS, SNMP,
/// HTTP fingerprinting) and returns a summary of what changed.
pub async fn trigger(State(state): State<AppState>) -> Result<Json<ScanSummary>, AppError> {
    let subnets = &state.config.scanner.subnets;
    let arp_settle = state.config.scanner.arp_settle_millis;
    let grace = state.config.scanner.offline_grace_seconds;

    let discovered = crate::scanner::scan_subnets(subnets, arp_settle)
        .await
        .map_err(|e| {
            tracing::error!("Manual scan failed: {e}");
            AppError::Internal(format!("Scan failed: {e}"))
        })?;

    tracing::info!(count = discovered.len(), "Manual network scan completed");

    let summary =
        crate::scanner::process_scan_results(&state.db, &discovered, grace, &state.ws_hub)
            .await
            .map_err(|e| {
                tracing::error!("Failed to process manual scan results: {e}");
                AppError::Internal(format!("Failed to process results: {e}"))
            })?;

    tracing::info!(
        new = summary.new_devices,
        updated = summary.updated_devices,
        offline = summary.offline_devices,
        "Manual scan summary"
    );

    Ok(Json(summary))
}
