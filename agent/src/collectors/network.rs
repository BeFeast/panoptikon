use serde::Serialize;
use std::collections::HashMap;
use sysinfo::Networks;

/// Network interface information.
#[derive(Debug, Serialize)]
pub struct NetworkInterface {
    pub name: String,
    pub mac: String,
    pub tx_bytes: u64,
    pub rx_bytes: u64,
    pub tx_bytes_delta: u64,
    pub rx_bytes_delta: u64,
    pub state: String,
}

/// Collect network interface statistics with in-memory delta tracking.
///
/// `prev_counters` maps interface name → `(tx_cumulative, rx_cumulative)`.
/// On each call, deltas are computed from the previous values and the
/// map is updated with current counters.  On the first call (or for
/// newly-appeared interfaces) deltas are 0.
pub fn collect_from(
    networks: &Networks,
    prev_counters: &mut HashMap<String, (u64, u64)>,
) -> Vec<NetworkInterface> {
    networks
        .iter()
        .filter(|(name, _)| {
            // Filter out loopback and virtual interfaces.
            !name.starts_with("lo") && !name.starts_with("veth") && !name.starts_with("docker")
        })
        .map(|(name, data)| {
            let current_tx = data.total_transmitted();
            let current_rx = data.total_received();

            // Compute deltas from previous counters.
            let (tx_delta, rx_delta) = match prev_counters.get(name.as_str()) {
                Some(&(prev_tx, prev_rx)) => {
                    // Handle counter reset/overflow: if current < previous, delta is 0.
                    let tx_d = current_tx.saturating_sub(prev_tx);
                    let rx_d = current_rx.saturating_sub(prev_rx);
                    (tx_d, rx_d)
                }
                None => (0, 0),
            };

            // Update counters for next report.
            prev_counters.insert(name.clone(), (current_tx, current_rx));

            NetworkInterface {
                name: name.clone(),
                mac: data.mac_address().to_string(),
                tx_bytes: current_tx,
                rx_bytes: current_rx,
                tx_bytes_delta: tx_delta,
                rx_bytes_delta: rx_delta,
                state: "up".to_string(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delta_no_previous() {
        let mut prev: HashMap<String, (u64, u64)> = HashMap::new();

        let (tx_delta, rx_delta) = match prev.get("eth0") {
            Some(&(prev_tx, prev_rx)) => (
                100u64.saturating_sub(prev_tx),
                200u64.saturating_sub(prev_rx),
            ),
            None => (0, 0),
        };

        assert_eq!(tx_delta, 0);
        assert_eq!(rx_delta, 0);

        // Store counters for next cycle.
        prev.insert("eth0".to_string(), (100, 200));
        assert_eq!(prev["eth0"], (100, 200));
    }

    #[test]
    fn test_delta_with_previous() {
        let mut prev: HashMap<String, (u64, u64)> = HashMap::new();
        prev.insert("eth0".to_string(), (10_000, 20_000));

        let current_tx = 15_000u64;
        let current_rx = 25_000u64;

        let (tx_delta, rx_delta) = match prev.get("eth0") {
            Some(&(prev_tx, prev_rx)) => (
                current_tx.saturating_sub(prev_tx),
                current_rx.saturating_sub(prev_rx),
            ),
            None => (0, 0),
        };

        assert_eq!(tx_delta, 5_000);
        assert_eq!(rx_delta, 5_000);
    }

    #[test]
    fn test_delta_counter_reset() {
        let mut prev: HashMap<String, (u64, u64)> = HashMap::new();
        prev.insert("eth0".to_string(), (99_999, 88_888));

        let current_tx = 100u64;
        let current_rx = 200u64;

        let (tx_delta, rx_delta) = match prev.get("eth0") {
            Some(&(prev_tx, prev_rx)) => (
                current_tx.saturating_sub(prev_tx),
                current_rx.saturating_sub(prev_rx),
            ),
            None => (0, 0),
        };

        assert_eq!(tx_delta, 0);
        assert_eq!(rx_delta, 0);
    }
}
