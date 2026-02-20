use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use sysinfo::Networks;
use tracing::warn;

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

/// Per-interface cumulative counter state persisted between reports.
#[derive(Debug, Serialize, Deserialize, Clone)]
struct InterfaceCounters {
    tx: u64,
    rx: u64,
}

/// Returns the path to the network counters state file.
///
/// On Linux: `~/.local/share/panoptikon-agent/net-counters.json`
/// On macOS: `~/Library/Application Support/panoptikon-agent/net-counters.json`
fn state_file_path() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("panoptikon-agent").join("net-counters.json"))
}

/// Load previous counters from the state file. Returns None if file doesn't exist or is invalid.
fn load_previous_counters() -> Option<HashMap<String, InterfaceCounters>> {
    let path = state_file_path()?;
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

/// Save current counters to the state file atomically (write to temp, rename).
fn save_counters(counters: &HashMap<String, InterfaceCounters>) {
    let Some(path) = state_file_path() else {
        warn!("Could not determine data_local_dir for counter state file");
        return;
    };

    // Ensure parent directory exists.
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            warn!("Failed to create state dir {}: {e}", parent.display());
            return;
        }
    }

    // Write to a temp file in the same directory, then rename for atomicity.
    let tmp_path = path.with_extension("json.tmp");
    match serde_json::to_string(counters) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&tmp_path, &json) {
                warn!("Failed to write temp state file: {e}");
                return;
            }
            if let Err(e) = std::fs::rename(&tmp_path, &path) {
                warn!("Failed to rename temp state file: {e}");
                // Try to clean up temp file
                let _ = std::fs::remove_file(&tmp_path);
            }
        }
        Err(e) => {
            warn!("Failed to serialize counters: {e}");
        }
    }
}

/// Collect network interface statistics with proper delta tracking.
///
/// Uses a persistent state file to store cumulative counters between reports.
/// On first call (no state file), deltas are 0. Subsequent calls compute
/// real deltas from the difference in cumulative counters.
pub fn collect() -> Vec<NetworkInterface> {
    let networks = Networks::new_with_refreshed_list();

    // Load previous counters (None on first boot).
    let previous = load_previous_counters();

    // Build current counters and compute deltas.
    let mut current_counters: HashMap<String, InterfaceCounters> = HashMap::new();

    let interfaces: Vec<NetworkInterface> = networks
        .iter()
        .filter(|(name, _)| {
            // Filter out loopback and virtual interfaces.
            !name.starts_with("lo") && !name.starts_with("veth") && !name.starts_with("docker")
        })
        .map(|(name, data)| {
            let current_tx = data.total_transmitted();
            let current_rx = data.total_received();

            // Store current cumulative counters for next report.
            current_counters.insert(
                name.clone(),
                InterfaceCounters {
                    tx: current_tx,
                    rx: current_rx,
                },
            );

            // Compute deltas from previous counters.
            let (tx_delta, rx_delta) = match previous.as_ref().and_then(|p| p.get(name.as_str())) {
                Some(prev) => {
                    // Handle counter reset/overflow: if current < previous, treat as 0.
                    let tx_d = current_tx.saturating_sub(prev.tx);
                    let rx_d = current_rx.saturating_sub(prev.rx);
                    (tx_d, rx_d)
                }
                None => {
                    // No previous state for this interface — first boot or new interface.
                    (0, 0)
                }
            };

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
        .collect();

    // Persist current counters for next report.
    save_counters(&current_counters);

    interfaces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delta_computation_no_previous() {
        // When there's no previous state, deltas should be 0.
        let previous: Option<HashMap<String, InterfaceCounters>> = None;
        let current_tx = 12345u64;
        let current_rx = 67890u64;
        let name = "eth0";

        let (tx_delta, rx_delta) = match previous.as_ref().and_then(|p| p.get(name)) {
            Some(prev) => {
                let tx_d = current_tx.saturating_sub(prev.tx);
                let rx_d = current_rx.saturating_sub(prev.rx);
                (tx_d, rx_d)
            }
            None => (0, 0),
        };

        assert_eq!(tx_delta, 0);
        assert_eq!(rx_delta, 0);
    }

    #[test]
    fn test_delta_computation_with_previous() {
        let mut previous = HashMap::new();
        previous.insert(
            "eth0".to_string(),
            InterfaceCounters {
                tx: 10000,
                rx: 20000,
            },
        );

        let current_tx = 15000u64;
        let current_rx = 25000u64;
        let name = "eth0";

        let (tx_delta, rx_delta) = match previous.get(name) {
            Some(prev) => {
                let tx_d = current_tx.saturating_sub(prev.tx);
                let rx_d = current_rx.saturating_sub(prev.rx);
                (tx_d, rx_d)
            }
            None => (0, 0),
        };

        assert_eq!(tx_delta, 5000);
        assert_eq!(rx_delta, 5000);
    }

    #[test]
    fn test_delta_computation_counter_reset() {
        // If current < previous (counter reset), delta should be 0.
        let mut previous = HashMap::new();
        previous.insert(
            "eth0".to_string(),
            InterfaceCounters {
                tx: 99999,
                rx: 88888,
            },
        );

        let current_tx = 100u64; // Reset happened
        let current_rx = 200u64;
        let name = "eth0";

        let (tx_delta, rx_delta) = match previous.get(name) {
            Some(prev) => {
                let tx_d = current_tx.saturating_sub(prev.tx);
                let rx_d = current_rx.saturating_sub(prev.rx);
                (tx_d, rx_d)
            }
            None => (0, 0),
        };

        assert_eq!(tx_delta, 0);
        assert_eq!(rx_delta, 0);
    }

    #[test]
    fn test_counters_serialization_roundtrip() {
        let mut counters = HashMap::new();
        counters.insert(
            "eth0".to_string(),
            InterfaceCounters {
                tx: 12345,
                rx: 67890,
            },
        );
        counters.insert("wlan0".to_string(), InterfaceCounters { tx: 100, rx: 200 });

        let json = serde_json::to_string(&counters).unwrap();
        let deserialized: HashMap<String, InterfaceCounters> = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized["eth0"].tx, 12345);
        assert_eq!(deserialized["eth0"].rx, 67890);
        assert_eq!(deserialized["wlan0"].tx, 100);
        assert_eq!(deserialized["wlan0"].rx, 200);
    }
}
