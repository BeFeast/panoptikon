use anyhow::Result;
use tracing::debug;

use super::DiscoveredDevice;

/// Read the system ARP table from /proc/net/arp (Linux).
///
/// This is a fallback when raw ARP scanning isn't available.
/// Format:
/// ```text
/// IP address       HW type     Flags       HW address            Mask     Device
/// 10.10.0.1        0x1         0x2         aa:bb:cc:dd:ee:ff     *        eth0
/// ```
pub async fn read_arp_table() -> Result<Vec<DiscoveredDevice>> {
    let content = match tokio::fs::read_to_string("/proc/net/arp").await {
        Ok(c) => c,
        Err(_) => {
            debug!("/proc/net/arp not available, falling back to arp command");
            return read_arp_command().await;
        }
    };

    let mut devices = Vec::new();

    for line in content.lines().skip(1) {
        // skip header
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            let ip = parts[0].to_string();
            let flags = parts[2];
            let mac = parts[3].to_string();

            // Skip incomplete entries (flags 0x0) and broadcast.
            if flags == "0x0" || mac == "00:00:00:00:00:00" {
                continue;
            }

            devices.push(DiscoveredDevice { ip, mac });
        }
    }

    Ok(devices)
}

/// Fallback: parse output of `arp -a` command.
async fn read_arp_command() -> Result<Vec<DiscoveredDevice>> {
    let output = tokio::process::Command::new("arp")
        .arg("-a")
        .output()
        .await?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_arp_output(&stdout))
}

/// Parse the text output of `arp -a` into a list of discovered devices.
///
/// Expected format (common Linux/macOS):
/// ```text
/// ? (10.10.0.1) at bc:24:11:d6:6b:62 [ether] on eth0
/// ? (10.10.0.25) at <incomplete> on eth0
/// ```
/// Entries with `<incomplete>` MAC addresses are skipped.
pub(crate) fn parse_arp_output(output: &str) -> Vec<DiscoveredDevice> {
    let mut devices = Vec::new();

    for line in output.lines() {
        // Format varies by OS, common: hostname (IP) at MAC [ether] on iface
        if let (Some(ip_start), Some(ip_end)) = (line.find('('), line.find(')')) {
            let ip = line[ip_start + 1..ip_end].to_string();
            if let Some(at_pos) = line.find(" at ") {
                let rest = &line[at_pos + 4..];
                let mac_raw = rest.split_whitespace().next().unwrap_or("");
                if !mac_raw.is_empty() && mac_raw != "<incomplete>" {
                    let mac = normalize_mac(mac_raw);
                    devices.push(DiscoveredDevice { ip, mac });
                }
            }
        }
    }

    devices
}

/// Normalize a MAC address to lowercase colon-separated format.
///
/// Accepts colon-separated (`AA:BB:CC:DD:EE:FF`) or
/// hyphen-separated (`aa-bb-cc-dd-ee-ff`) input.
pub(crate) fn normalize_mac(mac: &str) -> String {
    mac.to_lowercase().replace('-', ":")
}

// TODO: Implement raw ARP scanning via pnet for active subnet probing.
// This requires CAP_NET_RAW capability. The raw scanner would send ARP
// requests to every IP in the subnet and collect replies, which is more
// thorough than reading the passive ARP cache.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_arp_output_basic() {
        let sample = "? (10.10.0.1) at bc:24:11:d6:6b:62 [ether] on eth0\n\
                      ? (10.10.0.10) at 60:be:b4:28:ec:64 [ether] on eth0\n\
                      ? (10.10.0.25) at <incomplete> on eth0";

        let entries = parse_arp_output(sample);
        assert_eq!(entries.len(), 2, "Incomplete entries should be skipped");
        assert_eq!(entries[0].ip, "10.10.0.1");
        assert_eq!(entries[0].mac, "bc:24:11:d6:6b:62");
        assert_eq!(entries[1].ip, "10.10.0.10");
        assert_eq!(entries[1].mac, "60:be:b4:28:ec:64");
    }

    #[test]
    fn test_parse_arp_output_all_incomplete() {
        let sample = "? (10.10.0.1) at <incomplete> on eth0\n\
                      ? (10.10.0.2) at <incomplete> on eth0";

        let entries = parse_arp_output(sample);
        assert!(
            entries.is_empty(),
            "All incomplete entries should yield empty result"
        );
    }

    #[test]
    fn test_parse_arp_output_empty() {
        let entries = parse_arp_output("");
        assert!(entries.is_empty());
    }

    #[test]
    fn test_parse_arp_output_mac_normalized() {
        // parse_arp_output normalizes MACs via normalize_mac (lowercase, colons).
        let sample = "? (192.168.1.1) at BC:24:11:D6:6B:62 [ether] on eth0";
        let entries = parse_arp_output(sample);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].mac, "bc:24:11:d6:6b:62");
    }

    #[test]
    fn test_normalize_mac_uppercase_colons() {
        assert_eq!(normalize_mac("BC:24:11:D6:6B:62"), "bc:24:11:d6:6b:62");
    }

    #[test]
    fn test_normalize_mac_lowercase_colons() {
        assert_eq!(normalize_mac("bc:24:11:d6:6b:62"), "bc:24:11:d6:6b:62");
    }

    #[test]
    fn test_normalize_mac_hyphens() {
        assert_eq!(normalize_mac("bc-24-11-d6-6b-62"), "bc:24:11:d6:6b:62");
    }

    #[test]
    fn test_normalize_mac_uppercase_hyphens() {
        assert_eq!(normalize_mac("BC-24-11-D6-6B-62"), "bc:24:11:d6:6b:62");
    }
}
