//! Ookla Speedtest CLI wrapper — runs `speedtest --format=json` and parses the result.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::time::Duration;
use tokio::process::Command;

/// Top-level result from the Ookla Speedtest CLI JSON output.
#[derive(Debug, Deserialize)]
pub struct OoklaSpeedtestResult {
    pub ping: OoklaPing,
    pub download: OoklaBandwidth,
    pub upload: OoklaBandwidth,
    #[serde(rename = "packetLoss")]
    pub packet_loss: f64,
    pub isp: String,
    pub server: OoklaServer,
    pub result: OoklaResultMeta,
}

/// Ping statistics from Ookla Speedtest.
#[derive(Debug, Deserialize)]
pub struct OoklaPing {
    pub latency: f64,
    pub jitter: f64,
}

/// Bandwidth measurement (download or upload). `bandwidth` is in bytes/sec.
#[derive(Debug, Deserialize)]
pub struct OoklaBandwidth {
    pub bandwidth: u64,
}

/// Server information from Ookla Speedtest.
#[derive(Debug, Deserialize)]
pub struct OoklaServer {
    pub name: String,
    pub location: String,
    pub country: String,
}

/// Result metadata from Ookla Speedtest.
#[derive(Debug, Deserialize)]
pub struct OoklaResultMeta {
    pub url: Option<String>,
}

/// Run the Ookla Speedtest CLI and return the parsed result.
///
/// Invokes `/usr/local/bin/speedtest --accept-license --accept-gdpr --format=json`
/// with a 120-second timeout (typical test takes 30–60s).
pub async fn run_speedtest_ookla() -> Result<OoklaSpeedtestResult> {
    let output = tokio::time::timeout(Duration::from_secs(120), async {
        Command::new("/usr/local/bin/speedtest")
            .args(["--accept-license", "--accept-gdpr", "--format=json"])
            .output()
            .await
            .context("failed to execute speedtest CLI")
    })
    .await
    .map_err(|_| anyhow::anyhow!("speedtest timed out after 120 seconds"))??;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("speedtest exited with {}: {}", output.status, stderr.trim());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: OoklaSpeedtestResult = serde_json::from_str(&stdout).with_context(|| {
        format!(
            "failed to parse speedtest JSON output: {}",
            &stdout[..stdout.len().min(200)]
        )
    })?;

    Ok(result)
}
