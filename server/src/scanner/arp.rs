use anyhow::Result;
use ipnetwork::IpNetwork;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

use super::DiscoveredDevice;

/// Maximum number of concurrent ping processes.
const PING_CONCURRENCY: usize = 64;

/// Send ICMP echo requests to every host IP in a CIDR subnet.
///
/// The purpose is **not** to confirm reachability — it is purely to populate
/// the kernel ARP table so that the subsequent `read_arp_table()` call
/// discovers all active devices on the subnet.
///
/// Each ping is launched as a child process (`ping -c 1 -W 1 <ip>`).
/// Exit codes are intentionally ignored.
pub async fn ping_sweep(subnet: &str) {
    let network: IpNetwork = match subnet.parse() {
        Ok(n) => n,
        Err(e) => {
            warn!(subnet = %subnet, error = %e, "Failed to parse subnet CIDR for ping sweep");
            return;
        }
    };

    let v4net = match network {
        IpNetwork::V4(v4) => v4,
        IpNetwork::V6(_) => {
            debug!(subnet = %subnet, "Skipping ping sweep for IPv6 subnet");
            return;
        }
    };

    // Iterate host IPs without collecting into a Vec — avoids allocating
    // potentially tens of thousands of strings for large CIDRs (/16, etc.).
    //
    // RFC 3021: /31 subnets have no network/broadcast — both addresses are
    // valid hosts. /32 is a single-host route. For prefix >= 31, include all
    // addresses; otherwise exclude network (first) and broadcast (last).
    let prefix_len = v4net.prefix();
    let net_addr = v4net.network();
    let bcast_addr = v4net.broadcast();
    let host_iter = v4net.iter().filter(move |ip| {
        if prefix_len >= 31 {
            true
        } else {
            *ip != net_addr && *ip != bcast_addr
        }
    });

    // Count hosts for logging.
    let host_count = if prefix_len >= 31 {
        v4net.size()
    } else {
        v4net.size().saturating_sub(2).max(0)
    };

    info!(
        subnet = %subnet,
        host_count = host_count,
        "Starting ping sweep"
    );

    let mut join_set: JoinSet<()> = JoinSet::new();

    for ip in host_iter {
        // Limit concurrency: wait for one to finish before spawning another.
        if join_set.len() >= PING_CONCURRENCY {
            let _ = join_set.join_next().await;
        }

        let ip_str = ip.to_string();
        join_set.spawn(async move {
            match tokio::process::Command::new("ping")
                .args(["-c", "1", "-W", "1", &ip_str])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .output()
                .await
            {
                Ok(_) => {} // exit code ignored intentionally — any response populates ARP
                Err(e) => debug!(ip = %ip_str, error = %e, "ping process failed to spawn"),
            }
        });
    }

    // Wait for all remaining pings to complete.
    while join_set.join_next().await.is_some() {}

    info!(subnet = %subnet, "Ping sweep complete");
}

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
