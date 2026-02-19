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
    let mut devices = Vec::new();

    for line in stdout.lines() {
        // Format varies by OS, common: hostname (IP) at MAC [ether] on iface
        if let (Some(ip_start), Some(ip_end)) = (line.find('('), line.find(')')) {
            let ip = line[ip_start + 1..ip_end].to_string();
            if let Some(at_pos) = line.find(" at ") {
                let rest = &line[at_pos + 4..];
                let mac = rest.split_whitespace().next().unwrap_or("").to_string();
                if !mac.is_empty() && mac != "<incomplete>" {
                    devices.push(DiscoveredDevice { ip, mac });
                }
            }
        }
    }

    Ok(devices)
}

// TODO: Implement raw ARP scanning via pnet for active subnet probing.
// This requires CAP_NET_RAW capability. The raw scanner would send ARP
// requests to every IP in the subnet and collect replies, which is more
// thorough than reading the passive ARP cache.
