use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, info};

/// Result of a NetBIOS name lookup.
#[derive(Debug, Clone)]
pub struct NetbiosResult {
    pub ip: String,
    pub name: Option<String>,
    pub workgroup: Option<String>,
}

/// Maximum concurrent nmblookup processes.
const NETBIOS_CONCURRENCY: usize = 8;

/// Timeout for a single nmblookup call.
const NETBIOS_TIMEOUT_SECS: u64 = 5;

/// Check if nmblookup is available on the system.
pub async fn is_available() -> bool {
    tokio::process::Command::new("nmblookup")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|_| true) // nmblookup --version may return non-zero
        .unwrap_or(false)
}

/// Run NetBIOS name lookups on a list of IPs.
///
/// Uses `nmblookup -A <ip>` to query Windows machine names.
/// Falls back gracefully if nmblookup is not installed.
pub async fn lookup_hosts(ips: &[String]) -> Vec<NetbiosResult> {
    if ips.is_empty() {
        return Vec::new();
    }

    if !is_available().await {
        debug!("nmblookup not available, skipping NetBIOS lookups");
        return Vec::new();
    }

    info!(count = ips.len(), "Starting NetBIOS lookups");

    let mut results = Vec::new();
    let mut join_set: JoinSet<Option<NetbiosResult>> = JoinSet::new();

    for ip in ips {
        if join_set.len() >= NETBIOS_CONCURRENCY {
            if let Some(Ok(Some(result))) = join_set.join_next().await {
                results.push(result);
            }
        }

        let ip = ip.clone();
        join_set.spawn(async move { lookup_single(&ip).await });
    }

    while let Some(result) = join_set.join_next().await {
        if let Ok(Some(r)) = result {
            results.push(r);
        }
    }

    info!(
        found = results.iter().filter(|r| r.name.is_some()).count(),
        "NetBIOS lookups complete"
    );
    results
}

/// Lookup a single host via `nmblookup -A <ip>`.
///
/// Example output:
/// ```text
/// Looking up status of 10.0.0.5
///         WORKSTATION     <00> -         B <ACTIVE>
///         WORKGROUP       <00> - <GROUP> B <ACTIVE>
///         WORKSTATION     <20> -         B <ACTIVE>
/// ```
async fn lookup_single(ip: &str) -> Option<NetbiosResult> {
    let result = tokio::time::timeout(
        Duration::from_secs(NETBIOS_TIMEOUT_SECS),
        tokio::process::Command::new("nmblookup")
            .args(["-A", ip])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Some(parse_nmblookup_output(&stdout, ip))
        }
        Ok(Err(e)) => {
            debug!(ip = %ip, error = %e, "nmblookup process failed");
            None
        }
        Err(_) => {
            debug!(ip = %ip, "nmblookup timed out");
            None
        }
    }
}

/// Parse nmblookup -A output to extract machine name and workgroup.
fn parse_nmblookup_output(output: &str, ip: &str) -> NetbiosResult {
    let mut name = None;
    let mut workgroup = None;

    for line in output.lines() {
        let trimmed = line.trim();
        // Skip non-entry lines
        if trimmed.is_empty() || trimmed.starts_with("Looking up") || trimmed.starts_with("MAC") {
            continue;
        }

        // Parse: NAME  <type> - [<GROUP>] B <ACTIVE>
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 4 && parts.iter().any(|p| *p == "<ACTIVE>") {
            let entry_name = parts[0];
            let type_code = parts[1];

            // <00> is the workstation/workgroup name
            if type_code == "<00>" {
                if parts.iter().any(|p| *p == "<GROUP>") {
                    if workgroup.is_none() {
                        workgroup = Some(entry_name.to_string());
                    }
                } else if name.is_none() {
                    name = Some(entry_name.to_string());
                }
            }
        }
    }

    NetbiosResult {
        ip: ip.to_string(),
        name,
        workgroup,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_nmblookup_output() {
        let output = "Looking up status of 10.0.0.5\n\
                       \tWORKSTATION     <00> -         B <ACTIVE>\n\
                       \tWORKGROUP       <00> - <GROUP> B <ACTIVE>\n\
                       \tWORKSTATION     <20> -         B <ACTIVE>\n\
                       \n\tMAC Address = AA-BB-CC-DD-EE-FF\n";

        let result = parse_nmblookup_output(output, "10.0.0.5");
        assert_eq!(result.ip, "10.0.0.5");
        assert_eq!(result.name.as_deref(), Some("WORKSTATION"));
        assert_eq!(result.workgroup.as_deref(), Some("WORKGROUP"));
    }

    #[test]
    fn test_parse_nmblookup_no_response() {
        let output = "Looking up status of 10.0.0.99\n\
                       No reply from 10.0.0.99\n";
        let result = parse_nmblookup_output(output, "10.0.0.99");
        assert!(result.name.is_none());
        assert!(result.workgroup.is_none());
    }

    #[test]
    fn test_parse_nmblookup_empty() {
        let result = parse_nmblookup_output("", "10.0.0.1");
        assert!(result.name.is_none());
        assert!(result.workgroup.is_none());
    }
}
