//! Standalone iperf3 speed test — runs iperf3 client locally against public servers.

use anyhow::{Context, Result};
use std::time::Duration;
use tokio::process::Command;

/// A public iperf3 server endpoint.
struct Iperf3Server {
    host: &'static str,
    port: u16,
}

/// Public iperf3 servers to try, in order of preference.
const PUBLIC_SERVERS: &[Iperf3Server] = &[
    Iperf3Server {
        host: "iperf.he.net",
        port: 5201,
    },
    Iperf3Server {
        host: "speedtest.wtnet.de",
        port: 5200,
    },
    Iperf3Server {
        host: "bouygues.testdebit.info",
        port: 5200,
    },
];

/// Run an iperf3 client test against public servers.
///
/// Tries each server in order until one succeeds.
/// `reverse` controls the `--reverse` flag (measures upload when true).
/// Returns `(json_output, server_used)`.
pub async fn run_iperf3_local(reverse: bool) -> Result<(String, String)> {
    let mut last_error = String::new();

    for server in PUBLIC_SERVERS {
        tracing::info!(
            "Trying iperf3 server {}:{} (reverse={})",
            server.host,
            server.port,
            reverse
        );

        let mut args = vec![
            "--client".to_string(),
            server.host.to_string(),
            "--port".to_string(),
            server.port.to_string(),
            "--time".to_string(),
            "5".to_string(),
            "--json".to_string(),
        ];
        if reverse {
            args.push("--reverse".to_string());
        }

        let result = tokio::time::timeout(Duration::from_secs(20), async {
            Command::new("iperf3")
                .args(&args)
                .output()
                .await
                .context("failed to execute iperf3")
        })
        .await;

        match result {
            Ok(Ok(output)) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                // Verify it's valid JSON with an "end" section
                if stdout.contains("\"end\"") {
                    let server_name = format!("{}:{}", server.host, server.port);
                    tracing::info!("iperf3 succeeded with server {server_name}");
                    return Ok((stdout, server_name));
                } else {
                    last_error = format!(
                        "{}:{} returned invalid iperf3 output",
                        server.host, server.port
                    );
                    tracing::warn!("{last_error}");
                }
            }
            Ok(Ok(output)) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                last_error = format!("{}:{} failed: {}", server.host, server.port, stderr.trim());
                tracing::warn!("{last_error}");
            }
            Ok(Err(e)) => {
                last_error = format!("{}:{} exec error: {e}", server.host, server.port);
                tracing::warn!("{last_error}");
            }
            Err(_) => {
                last_error = format!("{}:{} timed out (20s)", server.host, server.port);
                tracing::warn!("{last_error}");
            }
        }
    }

    anyhow::bail!("All public iperf3 servers failed. Last error: {last_error}")
}
