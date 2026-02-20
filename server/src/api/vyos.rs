use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use super::AppState;

/// Status response for the router.
#[derive(Debug, Serialize)]
pub struct RouterStatus {
    pub configured: bool,
    pub reachable: bool,
    pub version: Option<String>,
    pub uptime: Option<String>,
    pub hostname: Option<String>,
}

/// GET /api/v1/vyos/status — check if VyOS is configured and reachable.
pub async fn status(State(state): State<AppState>) -> Json<RouterStatus> {
    let client = match get_vyos_client_from_db(&state.db, &state.config).await {
        Some(c) => c,
        None => {
            return Json(RouterStatus {
                configured: false,
                reachable: false,
                version: None,
                uptime: None,
                hostname: None,
            });
        }
    };

    // Try to fetch version and uptime
    let version = client.show(&["version"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            // Extract "Version: VyOS xxx" line
            s.lines()
                .find(|l| l.starts_with("Version:"))
                .map(|l| l.trim_start_matches("Version:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let uptime = client.show(&["system", "uptime"]).await.ok().and_then(|v| {
        v.as_str().map(|s| {
            s.lines()
                .find(|l| l.starts_with("Uptime:"))
                .map(|l| l.trim_start_matches("Uptime:").trim().to_string())
                .unwrap_or_else(|| s.to_string())
        })
    });

    let hostname = client
        .show(&["host", "name"])
        .await
        .ok()
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()));

    let reachable = version.is_some() || uptime.is_some();

    Json(RouterStatus {
        configured: true,
        reachable,
        version,
        uptime,
        hostname,
    })
}

/// GET /api/v1/vyos/interfaces — fetch VyOS interface information (operational).
pub async fn interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client.show(&["interfaces"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS interfaces query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/routes — fetch VyOS routing table.
pub async fn routes(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client.show(&["ip", "route"]).await.map(Json).map_err(|e| {
        tracing::error!("VyOS routes query failed: {e}");
        StatusCode::BAD_GATEWAY
    })
}

/// GET /api/v1/vyos/dhcp-leases — fetch DHCP server leases from VyOS.
pub async fn dhcp_leases(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .show(&["dhcp", "server", "leases"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS DHCP leases query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

/// GET /api/v1/vyos/firewall — fetch firewall config from VyOS.
pub async fn firewall(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    // Firewall may not be configured — that's OK, return empty object
    match client.retrieve(&["firewall"]).await {
        Ok(data) => Ok(Json(data)),
        Err(e) => {
            let msg = e.to_string();
            // VyOS returns error when path is empty (no firewall configured)
            if msg.contains("empty") || msg.contains("does not exist") {
                Ok(Json(serde_json::json!({})))
            } else {
                tracing::error!("VyOS firewall query failed: {e}");
                Err(StatusCode::BAD_GATEWAY)
            }
        }
    }
}

/// GET /api/v1/vyos/config-interfaces — fetch interface configuration (structured).
pub async fn config_interfaces(State(state): State<AppState>) -> Result<Json<Value>, StatusCode> {
    let client = get_vyos_client_or_503(&state).await?;
    client
        .retrieve(&["interfaces"])
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("VyOS config-interfaces query failed: {e}");
            StatusCode::BAD_GATEWAY
        })
}

// ── Speed Test ──────────────────────────────────────────────────────

/// Speed test result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeedTestResult {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub latency_ms: f64,
    pub tested_at: DateTime<Utc>,
}

/// Error response for the speed test endpoint.
#[derive(Debug, Serialize)]
pub struct SpeedTestError {
    pub error: String,
}

/// Parsed iperf3 end-of-test summary.
#[derive(Debug, Deserialize)]
struct Iperf3End {
    sum_received: Option<Iperf3Sum>,
}

#[derive(Debug, Deserialize)]
struct Iperf3Sum {
    bits_per_second: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct Iperf3Result {
    end: Option<Iperf3End>,
}

/// Parse iperf3 JSON output and extract bits_per_second from sum_received.
pub fn parse_iperf3_bps(json_str: &str) -> Result<f64, String> {
    let parsed: Iperf3Result =
        serde_json::from_str(json_str).map_err(|e| format!("failed to parse iperf3 JSON: {e}"))?;

    let end = parsed
        .end
        .ok_or_else(|| "iperf3 JSON missing 'end' field".to_string())?;

    let sum = end
        .sum_received
        .ok_or_else(|| "iperf3 JSON missing 'end.sum_received' field".to_string())?;

    sum.bits_per_second
        .ok_or_else(|| "iperf3 JSON missing 'end.sum_received.bits_per_second' field".to_string())
}

const SPEEDTEST_RATE_LIMIT_SECS: i64 = 60;

/// POST /api/v1/router/speedtest — run a WAN speed test using iperf3 against public servers.
///
/// Does **not** require VyOS to be configured. Runs iperf3 locally on the
/// Panoptikon server to measure internet throughput.
pub async fn speedtest(
    State(state): State<AppState>,
) -> Result<Json<SpeedTestResult>, (StatusCode, Json<SpeedTestError>)> {
    // Rate limit: check if last test was less than 60 seconds ago
    {
        let last = state.last_speedtest.lock().await;
        if let Some(ref result) = *last {
            let elapsed = Utc::now()
                .signed_duration_since(result.tested_at)
                .num_seconds();
            if elapsed < SPEEDTEST_RATE_LIMIT_SECS {
                return Err((
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(SpeedTestError {
                        error: format!(
                            "Rate limited. Please wait {}s before running another test.",
                            SPEEDTEST_RATE_LIMIT_SECS - elapsed
                        ),
                    }),
                ));
            }
        }
    }

    // Check iperf3 is installed locally
    let iperf3_check = tokio::process::Command::new("iperf3")
        .arg("--version")
        .output()
        .await;

    if iperf3_check.is_err() || !iperf3_check.unwrap().status.success() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(SpeedTestError {
                error: "iperf3 not installed on server".to_string(),
            }),
        ));
    }

    tracing::info!("Starting WAN speed test via public iperf3 servers");

    // --- Download test (--reverse: server sends to us) ---
    let (download_json, server_name) =
        crate::vyos::iperf3::run_iperf3_local(true)
            .await
            .map_err(|e| {
                tracing::error!("iperf3 download test failed: {e}");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(SpeedTestError {
                        error: format!("Download test failed: {e}"),
                    }),
                )
            })?;

    let download_mbps = match parse_iperf3_bps(&download_json) {
        Ok(bps) => bps / 1_000_000.0,
        Err(e) => {
            tracing::error!("Failed to parse download iperf3 result: {e}");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SpeedTestError {
                    error: format!("Failed to parse iperf3 download result: {e}"),
                }),
            ));
        }
    };

    // --- Upload test (no --reverse: we send to server) ---
    let upload_mbps = match crate::vyos::iperf3::run_iperf3_local(false).await {
        Ok((upload_json, _)) => match parse_iperf3_bps(&upload_json) {
            Ok(bps) => bps / 1_000_000.0,
            Err(e) => {
                tracing::error!("Failed to parse upload iperf3 result: {e}");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(SpeedTestError {
                        error: format!("Failed to parse iperf3 upload result: {e}"),
                    }),
                ));
            }
        },
        Err(e) => {
            tracing::error!("iperf3 upload test failed: {e}");
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(SpeedTestError {
                    error: format!("Upload test failed: {e}"),
                }),
            ));
        }
    };

    // iperf3 doesn't provide latency; could ping separately
    let latency_ms = 0.0;

    let result = SpeedTestResult {
        download_mbps: (download_mbps * 100.0).round() / 100.0,
        upload_mbps: (upload_mbps * 100.0).round() / 100.0,
        latency_ms,
        tested_at: Utc::now(),
    };

    // Cache the result
    {
        let mut last = state.last_speedtest.lock().await;
        *last = Some(result.clone());
    }

    tracing::info!(
        "WAN speed test complete via {server_name}: download={:.2} Mbps, upload={:.2} Mbps",
        result.download_mbps,
        result.upload_mbps
    );

    Ok(Json(result))
}

// ── Helpers ─────────────────────────────────────────────────────────

/// Read VyOS URL and API key from the settings table, falling back to config file values.
async fn get_vyos_settings(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> (Option<String>, Option<String>) {
    let db_url: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_url'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    let db_key: Option<String> =
        sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'vyos_api_key'"#)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

    // DB values take priority, fall back to config file
    let url = db_url
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.url.clone());
    let key = db_key
        .filter(|s| !s.is_empty())
        .or_else(|| config.vyos.api_key.clone());

    (url, key)
}

/// Try to construct a VyOS client from DB settings + config. Returns None if not configured.
async fn get_vyos_client_from_db(
    db: &SqlitePool,
    config: &crate::config::AppConfig,
) -> Option<crate::vyos::client::VyosClient> {
    let (url, key) = get_vyos_settings(db, config).await;
    match (url, key) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => {
            Some(crate::vyos::client::VyosClient::new(&u, &k))
        }
        _ => None,
    }
}

/// Get VyOS client or return 503 SERVICE_UNAVAILABLE if not configured.
async fn get_vyos_client_or_503(
    state: &AppState,
) -> Result<crate::vyos::client::VyosClient, StatusCode> {
    get_vyos_client_from_db(&state.db, &state.config)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// A realistic iperf3 JSON output for testing.
    const IPERF3_SAMPLE_JSON: &str = r#"{
        "start": {
            "connecting_to": {
                "host": "10.10.0.14",
                "port": 5201
            },
            "version": "iperf 3.6",
            "timestamp": {
                "time": "Fri, 21 Feb 2026 00:00:00 GMT",
                "timesecs": 1771545600
            }
        },
        "intervals": [],
        "end": {
            "sum_sent": {
                "start": 0,
                "end": 5.000050,
                "seconds": 5.000050,
                "bytes": 587202560,
                "bits_per_second": 939513379.456,
                "retransmits": 0,
                "sender": true
            },
            "sum_received": {
                "start": 0,
                "end": 5.000050,
                "seconds": 5.000050,
                "bytes": 585105408,
                "bits_per_second": 936157654.123,
                "retransmits": 0,
                "sender": false
            }
        }
    }"#;

    #[test]
    fn test_parse_iperf3_json_result() {
        let bps = parse_iperf3_bps(IPERF3_SAMPLE_JSON).expect("should parse successfully");
        let mbps = bps / 1_000_000.0;
        // 936157654.123 / 1_000_000 ≈ 936.16
        assert!(
            (mbps - 936.16).abs() < 0.1,
            "expected ~936.16 Mbps, got {mbps}"
        );
    }

    #[test]
    fn test_parse_iperf3_missing_fields() {
        // Missing 'end' field entirely
        let no_end = r#"{"start": {}}"#;
        let err = parse_iperf3_bps(no_end).unwrap_err();
        assert!(
            err.contains("missing 'end' field"),
            "expected 'missing end' error, got: {err}"
        );

        // Missing 'sum_received'
        let no_sum = r#"{"end": {"sum_sent": {"bits_per_second": 100}}}"#;
        let err = parse_iperf3_bps(no_sum).unwrap_err();
        assert!(
            err.contains("missing 'end.sum_received' field"),
            "expected 'missing sum_received' error, got: {err}"
        );

        // Missing 'bits_per_second'
        let no_bps = r#"{"end": {"sum_received": {}}}"#;
        let err = parse_iperf3_bps(no_bps).unwrap_err();
        assert!(
            err.contains("missing 'end.sum_received.bits_per_second' field"),
            "expected 'missing bits_per_second' error, got: {err}"
        );

        // Invalid JSON
        let bad_json = "not json at all";
        let err = parse_iperf3_bps(bad_json).unwrap_err();
        assert!(
            err.contains("failed to parse"),
            "expected parse error, got: {err}"
        );
    }

    #[tokio::test]
    async fn test_speedtest_rate_limit() {
        use std::sync::Arc;
        use tokio::sync::Mutex;

        // Create a cached result that was just done
        let recent_result = SpeedTestResult {
            download_mbps: 500.0,
            upload_mbps: 450.0,
            latency_ms: 0.5,
            tested_at: Utc::now(),
        };

        let last_speedtest: Arc<Mutex<Option<SpeedTestResult>>> =
            Arc::new(Mutex::new(Some(recent_result)));

        // Simulate rate-limit check
        {
            let last = last_speedtest.lock().await;
            if let Some(ref result) = *last {
                let elapsed = Utc::now()
                    .signed_duration_since(result.tested_at)
                    .num_seconds();
                assert!(
                    elapsed < SPEEDTEST_RATE_LIMIT_SECS,
                    "test should be within rate limit window"
                );
            }
        }

        // Test with an old result (> 60 seconds ago)
        let old_result = SpeedTestResult {
            download_mbps: 500.0,
            upload_mbps: 450.0,
            latency_ms: 0.5,
            tested_at: Utc::now() - chrono::Duration::seconds(120),
        };

        let last_speedtest_old: Arc<Mutex<Option<SpeedTestResult>>> =
            Arc::new(Mutex::new(Some(old_result)));

        {
            let last = last_speedtest_old.lock().await;
            if let Some(ref result) = *last {
                let elapsed = Utc::now()
                    .signed_duration_since(result.tested_at)
                    .num_seconds();
                assert!(
                    elapsed >= SPEEDTEST_RATE_LIMIT_SECS,
                    "old result should NOT be rate limited"
                );
            }
        }
    }
}
