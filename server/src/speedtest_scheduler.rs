//! Background scheduler for periodic speedtest runs.
//!
//! Reads the `speedtest_auto_interval_hours` setting from the DB on each tick.
//! When set to 0 (default), the scheduler is disabled and just sleeps.

use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{error, info};

/// Ookla speedtest CLI JSON output structures.
#[derive(Debug, serde::Deserialize)]
struct SpeedtestResult {
    download: SpeedtestBandwidth,
    upload: SpeedtestBandwidth,
    ping: SpeedtestPing,
    isp: String,
    server: SpeedtestServer,
    result: SpeedtestResultUrl,
    #[serde(default, rename = "packetLoss")]
    packet_loss: f64,
}

#[derive(Debug, serde::Deserialize)]
struct SpeedtestBandwidth {
    bandwidth: u64,
}

#[derive(Debug, serde::Deserialize)]
struct SpeedtestPing {
    latency: f64,
    jitter: f64,
}

#[derive(Debug, serde::Deserialize)]
struct SpeedtestServer {
    name: String,
    location: String,
    country: String,
}

#[derive(Debug, serde::Deserialize)]
struct SpeedtestResultUrl {
    url: Option<String>,
}

/// Run the Ookla speedtest CLI and parse the JSON output.
async fn run_speedtest_cli() -> Result<SpeedtestResult, anyhow::Error> {
    let output = tokio::process::Command::new("/usr/local/bin/speedtest")
        .args(["--accept-license", "--format=json"])
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("speedtest CLI failed (exit {}): {}", output.status, stderr);
    }

    let result: SpeedtestResult = serde_json::from_slice(&output.stdout)?;
    Ok(result)
}

/// Start the background speedtest scheduler.
///
/// Checks every 5 minutes whether it's time to run a speedtest.
/// The actual interval between tests is controlled by the
/// `speedtest_auto_interval_hours` setting in the DB (0 = disabled).
pub fn start_speedtest_scheduler(pool: SqlitePool) {
    tokio::spawn(async move {
        // Check every 5 minutes whether a scheduled run is needed.
        let check_interval = Duration::from_secs(300);
        let mut ticker = tokio::time::interval(check_interval);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        ticker.tick().await; // skip immediate first tick

        loop {
            ticker.tick().await;

            let interval_hours = get_auto_interval_hours(&pool).await;
            if interval_hours == 0 {
                continue; // auto-run disabled
            }

            // Check when the last speedtest was run.
            let should_run = match last_speedtest_age_hours(&pool).await {
                Some(hours_ago) => hours_ago >= interval_hours as f64,
                None => true, // no history at all — run first test
            };

            if !should_run {
                continue;
            }

            // Check that CLI is available before running.
            if tokio::fs::metadata("/usr/local/bin/speedtest")
                .await
                .is_err()
            {
                continue; // CLI not installed, skip silently
            }

            info!("speedtest scheduler: starting scheduled speed test");

            match run_speedtest_cli().await {
                Ok(ookla) => {
                    let download_mbps =
                        (ookla.download.bandwidth as f64 * 8.0 / 1_000_000.0 * 100.0).round()
                            / 100.0;
                    let upload_mbps =
                        (ookla.upload.bandwidth as f64 * 8.0 / 1_000_000.0 * 100.0).round() / 100.0;
                    let server = format!(
                        "{} - {}, {}",
                        ookla.server.name, ookla.server.location, ookla.server.country
                    );

                    crate::api::speedtest::persist_result(
                        &pool,
                        crate::api::speedtest::SpeedTestPersistParams {
                            download_mbps,
                            upload_mbps,
                            ping_ms: ookla.ping.latency,
                            jitter_ms: ookla.ping.jitter,
                            packet_loss: ookla.packet_loss,
                            isp: &ookla.isp,
                            server_name: &server,
                            result_url: ookla.result.url.as_deref(),
                        },
                    )
                    .await;

                    info!(
                        download = download_mbps,
                        upload = upload_mbps,
                        ping = ookla.ping.latency,
                        "speedtest scheduler: completed"
                    );
                }
                Err(e) => {
                    error!("speedtest scheduler: test failed: {e}");
                }
            }
        }
    });
}

/// Read the auto-run interval from the settings DB (0 = disabled).
async fn get_auto_interval_hours(pool: &SqlitePool) -> u64 {
    match sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'speedtest_auto_interval_hours'",
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(v)) => v.parse().unwrap_or(0),
        _ => 0,
    }
}

/// How many hours ago was the most recent speedtest? None if no history.
async fn last_speedtest_age_hours(pool: &SqlitePool) -> Option<f64> {
    sqlx::query_scalar::<_, f64>(
        r#"SELECT (julianday('now') - julianday(tested_at)) * 24
           FROM speedtest_history
           ORDER BY tested_at DESC
           LIMIT 1"#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}
