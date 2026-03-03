use std::time::Duration;
use tokio::task::JoinSet;
use tracing::{debug, info};

/// Result of an HTTP fingerprint probe for a single host.
#[derive(Debug, Clone)]
pub struct HttpFingerprintResult {
    pub ip: String,
    pub server_header: Option<String>,
    pub port: u16,
}

/// Maximum concurrent HTTP fingerprint requests.
const HTTP_CONCURRENCY: usize = 16;

/// Timeout for a single HTTP HEAD request.
const HTTP_TIMEOUT_SECS: u64 = 5;

/// Common HTTP ports to probe.
const HTTP_PORTS: &[u16] = &[80, 443, 8080, 8443];

/// Run HTTP fingerprinting on a list of IPs.
///
/// Sends HTTP HEAD requests to common ports and extracts the Server header.
/// This can identify device models (e.g., "MikroTik", "QNAP", "Synology").
pub async fn probe_hosts(ips: &[String]) -> Vec<HttpFingerprintResult> {
    if ips.is_empty() {
        return Vec::new();
    }

    info!(count = ips.len(), "Starting HTTP fingerprinting");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut results = Vec::new();
    let mut join_set: JoinSet<Vec<HttpFingerprintResult>> = JoinSet::new();

    for ip in ips {
        if join_set.len() >= HTTP_CONCURRENCY {
            if let Some(Ok(batch)) = join_set.join_next().await {
                results.extend(batch);
            }
        }

        let ip = ip.clone();
        let client = client.clone();
        join_set.spawn(async move { probe_single_host(&client, &ip).await });
    }

    while let Some(result) = join_set.join_next().await {
        if let Ok(batch) = result {
            results.extend(batch);
        }
    }

    info!(
        found = results.iter().filter(|r| r.server_header.is_some()).count(),
        "HTTP fingerprinting complete"
    );
    results
}

/// Probe a single host on common HTTP ports.
async fn probe_single_host(client: &reqwest::Client, ip: &str) -> Vec<HttpFingerprintResult> {
    let mut results = Vec::new();

    for &port in HTTP_PORTS {
        let scheme = if port == 443 || port == 8443 {
            "https"
        } else {
            "http"
        };
        let url = format!("{scheme}://{ip}:{port}/");

        match client.head(&url).send().await {
            Ok(resp) => {
                let server = resp
                    .headers()
                    .get("server")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());

                if server.is_some() {
                    debug!(ip = %ip, port = port, server = ?server, "HTTP fingerprint found");
                    results.push(HttpFingerprintResult {
                        ip: ip.to_string(),
                        server_header: server,
                        port,
                    });
                    // Found a server header — no need to try other ports.
                    break;
                }
            }
            Err(_) => {
                // Connection refused / timeout — port not open, skip.
            }
        }
    }

    results
}

/// Infer device type or model from the HTTP Server header.
pub fn infer_device_from_server(server: &str) -> Option<&'static str> {
    let lower = server.to_lowercase();

    if lower.contains("mikrotik") {
        Some("router")
    } else if lower.contains("synology") {
        Some("nas")
    } else if lower.contains("qnap") {
        Some("nas")
    } else if lower.contains("ubnt") || lower.contains("ubiquiti") || lower.contains("unifi") {
        Some("access_point")
    } else if lower.contains("hp-httpd") || lower.contains("epson") || lower.contains("canon") {
        Some("printer")
    } else if lower.contains("hikvision") || lower.contains("dahua") {
        Some("camera")
    } else if lower.contains("esphome") || lower.contains("tasmota") {
        Some("iot")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_device_from_server() {
        assert_eq!(infer_device_from_server("MikroTik"), Some("router"));
        assert_eq!(infer_device_from_server("Synology DSM"), Some("nas"));
        assert_eq!(infer_device_from_server("QNAP"), Some("nas"));
        assert_eq!(infer_device_from_server("UBNT/UniFi"), Some("access_point"));
        assert_eq!(infer_device_from_server("HP-HttpD"), Some("printer"));
        assert_eq!(infer_device_from_server("nginx"), None);
        assert_eq!(infer_device_from_server("Apache/2.4"), None);
    }
}
