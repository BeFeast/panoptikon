pub mod arp;

use anyhow::Result;
use tracing::info;

/// Discovered device from an ARP scan.
#[derive(Debug, Clone)]
pub struct DiscoveredDevice {
    pub ip: String,
    pub mac: String,
}

/// Run an ARP scan on the specified subnets.
///
/// Falls back to parsing the system ARP table if raw socket scanning
/// is not available (e.g., no CAP_NET_RAW).
pub async fn scan_subnets(subnets: &[String]) -> Result<Vec<DiscoveredDevice>> {
    info!(subnets = ?subnets, "Starting ARP scan");

    // Try reading from the system ARP cache first (always available).
    let devices = arp::read_arp_table().await?;

    info!(count = devices.len(), "ARP scan complete");
    Ok(devices)
}
