use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, info};

/// Result of an SNMP query for a single host.
#[derive(Debug, Clone)]
pub struct SnmpResult {
    pub ip: String,
    pub sys_name: Option<String>,
    pub sys_descr: Option<String>,
}

/// Maximum concurrent SNMP queries.
const SNMP_CONCURRENCY: usize = 8;

/// Timeout for a single SNMP query.
const SNMP_TIMEOUT_SECS: u64 = 5;

/// Check if snmpget is available on the system.
pub async fn is_available() -> bool {
    tokio::process::Command::new("snmpget")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|_| true) // snmpget --version may exit non-zero
        .unwrap_or(false)
}

/// Run SNMP queries on a list of IPs to discover sysName and sysDescr.
///
/// Uses SNMPv2c with the "public" community string (common default).
/// Falls back gracefully if snmpget is not installed.
pub async fn query_hosts(ips: &[String]) -> Vec<SnmpResult> {
    if ips.is_empty() {
        return Vec::new();
    }

    if !is_available().await {
        debug!("snmpget not available, skipping SNMP queries");
        return Vec::new();
    }

    info!(count = ips.len(), "Starting SNMP queries");

    let mut results = Vec::new();
    let mut join_set: JoinSet<Option<SnmpResult>> = JoinSet::new();

    for ip in ips {
        if join_set.len() >= SNMP_CONCURRENCY {
            if let Some(Ok(Some(result))) = join_set.join_next().await {
                results.push(result);
            }
        }

        let ip = ip.clone();
        join_set.spawn(async move { query_single(&ip).await });
    }

    while let Some(result) = join_set.join_next().await {
        if let Ok(Some(r)) = result {
            results.push(r);
        }
    }

    info!(
        found = results.iter().filter(|r| r.sys_name.is_some()).count(),
        "SNMP queries complete"
    );
    results
}

/// Query a single host for sysName.0 and sysDescr.0 via SNMPv2c.
async fn query_single(ip: &str) -> Option<SnmpResult> {
    let result = tokio::time::timeout(
        Duration::from_secs(SNMP_TIMEOUT_SECS),
        tokio::process::Command::new("snmpget")
            .args([
                "-v2c",
                "-c",
                "public",
                "-t",
                "2", // timeout 2s
                "-r",
                "1", // 1 retry
                ip,
                "sysName.0",
                "sysDescr.0",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Some(parse_snmpget_output(&stdout, ip))
        }
        Ok(Ok(_)) => {
            // Non-zero exit (device doesn't respond to SNMP) — not an error.
            debug!(ip = %ip, "SNMP query: no response");
            None
        }
        Ok(Err(e)) => {
            debug!(ip = %ip, error = %e, "snmpget process failed");
            None
        }
        Err(_) => {
            debug!(ip = %ip, "SNMP query timed out");
            None
        }
    }
}

/// Parse snmpget output to extract sysName and sysDescr values.
///
/// Example output:
/// ```text
/// SNMPv2-MIB::sysName.0 = STRING: router.local
/// SNMPv2-MIB::sysDescr.0 = STRING: RouterOS 7.14 on RB4011iGS+
/// ```
fn parse_snmpget_output(output: &str, ip: &str) -> SnmpResult {
    let mut sys_name = None;
    let mut sys_descr = None;

    for line in output.lines() {
        if let Some(value) = extract_snmp_string_value(line) {
            let lower = line.to_lowercase();
            if lower.contains("sysname") {
                sys_name = Some(value);
            } else if lower.contains("sysdescr") {
                sys_descr = Some(value);
            }
        }
    }

    SnmpResult {
        ip: ip.to_string(),
        sys_name,
        sys_descr,
    }
}

/// Extract the string value from a `KEY = STRING: value` line.
fn extract_snmp_string_value(line: &str) -> Option<String> {
    // Common format: OID = STRING: value
    // Also handles: OID = STRING: "quoted value"
    let sep = " = STRING: ";
    if let Some(idx) = line.find(sep) {
        let value = line[idx + sep.len()..].trim();
        let value = value.trim_matches('"');
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_snmpget_output() {
        let output = "SNMPv2-MIB::sysName.0 = STRING: router.local\n\
                       SNMPv2-MIB::sysDescr.0 = STRING: RouterOS 7.14 on RB4011iGS+\n";
        let result = parse_snmpget_output(output, "10.0.0.1");
        assert_eq!(result.sys_name.as_deref(), Some("router.local"));
        assert_eq!(
            result.sys_descr.as_deref(),
            Some("RouterOS 7.14 on RB4011iGS+")
        );
    }

    #[test]
    fn test_parse_snmpget_quoted() {
        let output = "SNMPv2-MIB::sysName.0 = STRING: \"my-switch\"\n";
        let result = parse_snmpget_output(output, "10.0.0.2");
        assert_eq!(result.sys_name.as_deref(), Some("my-switch"));
        assert!(result.sys_descr.is_none());
    }

    #[test]
    fn test_parse_snmpget_empty() {
        let result = parse_snmpget_output("", "10.0.0.1");
        assert!(result.sys_name.is_none());
        assert!(result.sys_descr.is_none());
    }

    #[test]
    fn test_extract_snmp_string_value() {
        assert_eq!(
            extract_snmp_string_value("OID = STRING: hello"),
            Some("hello".to_string())
        );
        assert_eq!(
            extract_snmp_string_value("OID = STRING: \"quoted\""),
            Some("quoted".to_string())
        );
        assert_eq!(extract_snmp_string_value("No match here"), None);
    }
}
