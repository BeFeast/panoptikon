//! SSH agentless monitoring — background poller that collects system metrics
//! from remote hosts via SSH.

pub mod collector;

use crate::ws::hub::WsHub;
use serde_json::json;
use sqlx::SqlitePool;
use std::sync::Arc;
use tracing::{error, info, warn};

/// Spawns background polling tasks for all enabled SSH targets.
/// Re-reads the target list from the database every cycle.
pub fn start_ssh_poller(db: SqlitePool, ws_hub: Arc<WsHub>) {
    tokio::spawn(async move {
        // Wait a few seconds to let the server finish starting up.
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        info!("SSH poller started");

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));

        loop {
            interval.tick().await;
            poll_all_targets(&db, &ws_hub).await;
        }
    });
}

/// Query all enabled targets and poll any whose interval has elapsed.
async fn poll_all_targets(db: &SqlitePool, ws_hub: &Arc<WsHub>) {
    let targets = match sqlx::query_as::<_, (String, String, String, i32, String, String, Option<String>, Option<String>, i32)>(
        "SELECT id, name, host, port, username, auth_type, password, private_key, poll_interval_secs \
         FROM ssh_targets WHERE enabled = 1",
    )
    .fetch_all(db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            error!("Failed to load SSH targets: {e}");
            return;
        }
    };

    for (id, name, host, port, username, auth_type, password, private_key, poll_interval) in targets
    {
        // Check if we should poll this target now (based on its interval).
        let should_poll = match sqlx::query_scalar::<_, Option<String>>(
            "SELECT reported_at FROM ssh_reports WHERE target_id = ? ORDER BY reported_at DESC LIMIT 1",
        )
        .bind(&id)
        .fetch_optional(db)
        .await
        {
            Ok(Some(Some(last_ts))) => {
                // Parse the timestamp and check if enough time has passed.
                match chrono::NaiveDateTime::parse_from_str(&last_ts, "%Y-%m-%d %H:%M:%S") {
                    Ok(last) => {
                        let now = chrono::Utc::now().naive_utc();
                        let elapsed = (now - last).num_seconds();
                        elapsed >= poll_interval as i64
                    }
                    Err(_) => true, // Can't parse → poll anyway
                }
            }
            _ => true, // No report yet → poll now
        };

        if !should_poll {
            continue;
        }

        // Run the SSH collection in a blocking task to not block the async runtime.
        let db_clone = db.clone();
        let ws_clone = ws_hub.clone();
        let target_id = id.clone();
        let target_name = name.clone();

        tokio::task::spawn_blocking(move || {
            let result = match auth_type.as_str() {
                "key" => {
                    if let Some(ref key) = private_key {
                        collector::collect_key(&host, port as u16, &username, key)
                    } else {
                        Err(anyhow::anyhow!("No private key configured for target {target_id}"))
                    }
                }
                _ => {
                    if let Some(ref pw) = password {
                        collector::collect_password(&host, port as u16, &username, pw)
                    } else {
                        Err(anyhow::anyhow!("No password configured for target {target_id}"))
                    }
                }
            };

            // Spawn an async task to store results.
            tokio::runtime::Handle::current().spawn(async move {
                match result {
                    Ok(metrics) => {
                        if let Err(e) = sqlx::query(
                            "INSERT INTO ssh_reports (target_id, hostname, os_name, os_version, \
                             cpu_percent, mem_total, mem_used, disk_total, disk_used, uptime_seconds) \
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        )
                        .bind(&target_id)
                        .bind(&metrics.hostname)
                        .bind(&metrics.os_name)
                        .bind(&metrics.os_version)
                        .bind(metrics.cpu_percent)
                        .bind(metrics.mem_total)
                        .bind(metrics.mem_used)
                        .bind(metrics.disk_total)
                        .bind(metrics.disk_used)
                        .bind(metrics.uptime_seconds)
                        .execute(&db_clone)
                        .await
                        {
                            error!(target = %target_id, "Failed to store SSH report: {e}");
                        } else {
                            ws_clone.broadcast(
                                "ssh_report",
                                json!({
                                    "target_id": target_id,
                                    "name": target_name,
                                    "cpu_percent": metrics.cpu_percent,
                                    "mem_total": metrics.mem_total,
                                    "mem_used": metrics.mem_used,
                                }),
                            );
                        }
                    }
                    Err(e) => {
                        warn!(target = %target_id, name = %target_name, "SSH poll failed: {e}");
                    }
                }
            });
        });
    }
}
