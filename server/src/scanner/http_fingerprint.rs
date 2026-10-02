use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
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

/// How long a probed IP is skipped before it is fingerprinted again.
pub const FINGERPRINT_TTL: Duration = Duration::from_secs(24 * 60 * 60);

/// Remembers when each IP was last fingerprinted, so the scanner does not
/// send HEAD requests to every live host on every cycle.
///
/// Hosts without an HTTP server are recorded too; they are the expensive case
/// (every port runs into the request timeout). An IP that has never been seen
/// (new device or changed address) is probed on the next cycle.
pub struct HttpFingerprintCache {
    ttl: Duration,
    probed_at: Mutex<HashMap<String, Instant>>,
}

impl Default for HttpFingerprintCache {
    fn default() -> Self {
        Self::new(FINGERPRINT_TTL)
    }
}

impl HttpFingerprintCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            probed_at: Mutex::new(HashMap::new()),
        }
    }

    /// Return the IPs that are due for probing at `now` and mark them as probed.
    ///
    /// Marking happens up front so that a concurrent scan (manual trigger
    /// during a periodic cycle) does not probe the same hosts twice.
    fn claim_due(&self, ips: &[String], now: Instant) -> Vec<String> {
        let mut probed_at = self.probed_at.lock().unwrap_or_else(|e| e.into_inner());
        probed_at.retain(|_, at| now.saturating_duration_since(*at) < self.ttl);
        let mut due = Vec::new();
        for ip in ips {
            if !probed_at.contains_key(ip) {
                probed_at.insert(ip.clone(), now);
                due.push(ip.clone());
            }
        }
        due
    }
}

/// Run HTTP fingerprinting on the IPs that `cache` considers due.
pub async fn probe_hosts_cached(
    cache: &HttpFingerprintCache,
    ips: &[String],
) -> Vec<HttpFingerprintResult> {
    probe_due_hosts(cache, ips, HTTP_PORTS, Instant::now()).await
}

async fn probe_due_hosts(
    cache: &HttpFingerprintCache,
    ips: &[String],
    ports: &'static [u16],
    now: Instant,
) -> Vec<HttpFingerprintResult> {
    let due = cache.claim_due(ips, now);
    if due.len() < ips.len() {
        debug!(
            skipped = ips.len() - due.len(),
            due = due.len(),
            "HTTP fingerprint cache hit"
        );
    }
    probe_hosts_on(&due, ports).await
}

/// Run HTTP fingerprinting on a list of IPs.
///
/// Sends HTTP HEAD requests to common ports and extracts the Server header.
/// This can identify device models (e.g., "MikroTik", "QNAP", "Synology").
async fn probe_hosts_on(ips: &[String], ports: &'static [u16]) -> Vec<HttpFingerprintResult> {
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
        join_set.spawn(async move { probe_single_host(&client, &ip, ports).await });
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
async fn probe_single_host(
    client: &reqwest::Client,
    ip: &str,
    ports: &[u16],
) -> Vec<HttpFingerprintResult> {
    let mut results = Vec::new();

    for &port in ports {
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
    } else if lower.contains("synology") || lower.contains("qnap") {
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

    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Start a loopback HTTP server that counts requests and returns a
    /// `Server` header. Returns its port and the request counter.
    async fn counting_http_server() -> (&'static [u16], Arc<AtomicUsize>) {
        let hits = Arc::new(AtomicUsize::new(0));
        let counter = hits.clone();
        let app = axum::Router::new().fallback(move || {
            let counter = counter.clone();
            async move {
                counter.fetch_add(1, Ordering::SeqCst);
                ([("server", "MikroTik")], "")
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(listener, app).await.ok();
        });
        (Box::leak(vec![port].into_boxed_slice()), hits)
    }

    #[tokio::test]
    async fn repeated_cycle_does_not_reprobe_fingerprinted_host() {
        let (ports, hits) = counting_http_server().await;
        let cache = HttpFingerprintCache::default();
        let ips = vec!["127.0.0.1".to_string()];
        let start = Instant::now();

        let first = probe_due_hosts(&cache, &ips, ports, start).await;
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].server_header.as_deref(), Some("MikroTik"));
        assert_eq!(hits.load(Ordering::SeqCst), 1);

        for minute in 1..=10 {
            let again = probe_due_hosts(
                &cache,
                &ips,
                ports,
                start + Duration::from_secs(60 * minute),
            )
            .await;
            assert!(again.is_empty());
        }
        assert_eq!(hits.load(Ordering::SeqCst), 1, "no HEAD before TTL expiry");

        let after_ttl = probe_due_hosts(
            &cache,
            &ips,
            ports,
            start + FINGERPRINT_TTL + Duration::from_secs(1),
        )
        .await;
        assert_eq!(after_ttl.len(), 1);
        assert_eq!(hits.load(Ordering::SeqCst), 2, "re-probed after TTL");
    }

    #[test]
    fn new_ip_is_due_immediately_and_negatives_are_cached() {
        let cache = HttpFingerprintCache::default();
        let now = Instant::now();
        let a = "10.0.0.1".to_string();
        let b = "10.0.0.2".to_string();

        assert_eq!(
            cache.claim_due(std::slice::from_ref(&a), now),
            vec![a.clone()]
        );
        // `a` is cached whether or not it had an HTTP server; `b` is new.
        assert_eq!(
            cache.claim_due(&[a.clone(), b.clone()], now + Duration::from_secs(60)),
            vec![b.clone()]
        );
        assert!(cache
            .claim_due(&[a.clone(), b.clone()], now + Duration::from_secs(120))
            .is_empty());
        assert_eq!(
            cache.claim_due(std::slice::from_ref(&a), now + FINGERPRINT_TTL),
            vec![a.clone()]
        );
    }

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
