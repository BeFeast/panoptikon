use serde::Serialize;
use sysinfo::Networks;

/// Network interface information.
#[derive(Debug, Serialize)]
pub struct NetworkInterface {
    pub name: String,
    pub mac: String,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    // Delta fields will be computed by comparing with previous report.
    // For now, report cumulative counters.
    pub tx_bytes_delta: u64,
    pub rx_bytes_delta: u64,
    pub state: String,
}

/// Collect network interface statistics.
pub fn collect() -> Vec<NetworkInterface> {
    let networks = Networks::new_with_refreshed_list();

    networks
        .iter()
        .filter(|(name, _)| {
            // Filter out loopback and virtual interfaces.
            !name.starts_with("lo") && !name.starts_with("veth") && !name.starts_with("docker")
        })
        .map(|(name, data)| NetworkInterface {
            name: name.clone(),
            mac: data.mac_address().to_string(),
            tx_bytes: data.total_transmitted(),
            rx_bytes: data.total_received(),
            // First report — deltas are since boot. Agent should track state
            // across reports for proper deltas. TODO: implement delta tracking.
            tx_bytes_delta: data.transmitted(),
            rx_bytes_delta: data.received(),
            state: "up".to_string(), // sysinfo doesn't expose link state directly
        })
        .collect()
}
