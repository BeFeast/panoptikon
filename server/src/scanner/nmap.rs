use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

/// Result of an nmap scan for a single host.
#[derive(Debug, Clone)]
pub struct NmapResult {
    pub ip: String,
    pub os_hint: Option<String>,
    pub open_ports: Vec<NmapPort>,
}

/// A single open port discovered by nmap.
#[derive(Debug, Clone)]
pub struct NmapPort {
    pub port: u16,
    pub protocol: String,
    pub service: String,
    pub version: String,
}

/// Maximum number of concurrent nmap scans.
const NMAP_CONCURRENCY: usize = 4;

/// Timeout for a single nmap scan.
const NMAP_TIMEOUT_SECS: u64 = 30;

/// Check if nmap is available on the system.
pub async fn is_available() -> bool {
    tokio::process::Command::new("nmap")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run nmap service version detection on a list of IPs.
///
/// Uses `-sV` for service detection and `-O --osscan-guess` for OS fingerprinting.
/// Falls back gracefully if nmap is not installed.
pub async fn scan_hosts(ips: &[String]) -> Vec<NmapResult> {
    if ips.is_empty() {
        return Vec::new();
    }

    if !is_available().await {
        debug!("nmap not available, skipping nmap scan");
        return Vec::new();
    }

    info!(count = ips.len(), "Starting nmap scan");

    let mut results = Vec::new();
    let mut join_set: JoinSet<Option<NmapResult>> = JoinSet::new();

    for ip in ips {
        if join_set.len() >= NMAP_CONCURRENCY {
            if let Some(Ok(Some(result))) = join_set.join_next().await {
                results.push(result);
            }
        }

        let ip = ip.clone();
        join_set.spawn(async move { scan_single_host(&ip).await });
    }

    while let Some(result) = join_set.join_next().await {
        if let Ok(Some(r)) = result {
            results.push(r);
        }
    }

    info!(count = results.len(), "nmap scan complete");
    results
}

/// Scan a single host with nmap -sV (service detection).
///
/// We skip -O (OS detection) because it requires root privileges.
/// Instead we rely on service banners for OS hints.
async fn scan_single_host(ip: &str) -> Option<NmapResult> {
    let result = tokio::time::timeout(
        Duration::from_secs(NMAP_TIMEOUT_SECS),
        tokio::process::Command::new("nmap")
            .args(["-sV", "-T4", "--top-ports", "100", "-oG", "-", ip])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Some(parse_nmap_grepable(&stdout, ip))
        }
        Ok(Err(e)) => {
            warn!(ip = %ip, error = %e, "nmap process failed");
            None
        }
        Err(_) => {
            warn!(ip = %ip, "nmap scan timed out");
            None
        }
    }
}

/// Parse nmap grepable output format (-oG).
///
/// Example line:
/// ```text
/// Host: 10.0.0.1 () Ports: 22/open/tcp//ssh//OpenSSH 8.9/, 80/open/tcp//http//nginx 1.18/
/// ```
fn parse_nmap_grepable(output: &str, ip: &str) -> NmapResult {
    let mut open_ports = Vec::new();
    let mut os_hint = None;

    for line in output.lines() {
        // Parse Ports: section
        if let Some(ports_start) = line.find("Ports: ") {
            let ports_str = &line[ports_start + 7..];
            // Split on comma+space for each port entry
            for port_entry in ports_str.split(", ") {
                // Format: port/state/protocol//service//version/
                let parts: Vec<&str> = port_entry.split('/').collect();
                if parts.len() >= 7 && parts[1] == "open" {
                    if let Ok(port) = parts[0].parse::<u16>() {
                        let service = parts[4].to_string();
                        let version = parts[6].trim_end_matches('/').to_string();

                        // Infer OS from service version strings
                        if os_hint.is_none() {
                            os_hint = infer_os_from_version(&version);
                        }

                        open_ports.push(NmapPort {
                            port,
                            protocol: parts[2].to_string(),
                            service,
                            version,
                        });
                    }
                }
            }
        }

        // Parse OS: line if present
        if let Some(stripped) = line.strip_prefix("OS: ") {
            os_hint = Some(stripped.to_string());
        }
    }

    NmapResult {
        ip: ip.to_string(),
        os_hint,
        open_ports,
    }
}

/// Infer OS family from service version strings.
fn infer_os_from_version(version: &str) -> Option<String> {
    let lower = version.to_lowercase();
    if lower.contains("ubuntu") || lower.contains("debian") {
        Some("Linux".to_string())
    } else if lower.contains("windows") || lower.contains("microsoft") {
        Some("Windows".to_string())
    } else if lower.contains("freebsd") {
        Some("FreeBSD".to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_nmap_grepable_basic() {
        let output = "Host: 10.0.0.1 ()\tPorts: 22/open/tcp//ssh//OpenSSH 8.9/, 80/open/tcp//http//nginx 1.18/\n";
        let result = parse_nmap_grepable(output, "10.0.0.1");
        assert_eq!(result.ip, "10.0.0.1");
        assert_eq!(result.open_ports.len(), 2);
        assert_eq!(result.open_ports[0].port, 22);
        assert_eq!(result.open_ports[0].service, "ssh");
        assert_eq!(result.open_ports[1].port, 80);
        assert_eq!(result.open_ports[1].service, "http");
    }

    #[test]
    fn test_parse_nmap_grepable_empty() {
        let output = "# Nmap done\n";
        let result = parse_nmap_grepable(output, "10.0.0.1");
        assert!(result.open_ports.is_empty());
        assert!(result.os_hint.is_none());
    }

    #[test]
    fn test_parse_nmap_grepable_closed_ports() {
        let output =
            "Host: 10.0.0.1 ()\tPorts: 22/closed/tcp//ssh//, 80/open/tcp//http//Apache 2.4/\n";
        let result = parse_nmap_grepable(output, "10.0.0.1");
        assert_eq!(result.open_ports.len(), 1);
        assert_eq!(result.open_ports[0].port, 80);
    }

    #[test]
    fn test_infer_os_from_version() {
        assert_eq!(
            infer_os_from_version("OpenSSH 8.9p1 Ubuntu 3"),
            Some("Linux".to_string())
        );
        assert_eq!(
            infer_os_from_version("Microsoft IIS 10.0"),
            Some("Windows".to_string())
        );
        assert_eq!(infer_os_from_version("nginx 1.18"), None);
    }
}
