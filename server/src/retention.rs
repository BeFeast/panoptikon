use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{error, info};

use crate::config::RetentionConfig;

/// Run one cycle of traffic rollup (samples → hourly → daily) followed by
/// retention cleanup: delete old rows from traffic_samples, agent_reports,
/// device_events, acknowledged alerts, and speedtest history.
/// Returns the counts of deleted rows.
pub async fn run_cleanup(pool: &SqlitePool, config: &RetentionConfig) -> (u64, u64, u64, u64, u64) {
    // Rollup BEFORE cleanup so samples are aggregated before being deleted.
    rollup_traffic_hourly(pool).await;
    rollup_traffic_daily(pool).await;

    let traffic = delete_old_traffic_samples(pool, config.traffic_samples_hours).await;
    let reports = delete_old_agent_reports(pool, config.agent_reports_days).await;
    let events = delete_old_device_events(pool, config.device_events_days).await;
    let alerts = delete_old_alerts(pool, config.alerts_days).await;

    // Speedtest retention: read from settings DB (runtime-configurable), default 90 days.
    let speedtest_days = get_speedtest_retention_days(pool).await;
    let speedtests = crate::api::speedtest::delete_old_speedtests(pool, speedtest_days).await;

    (traffic, reports, events, alerts, speedtests)
}

/// Aggregate traffic_samples into traffic_hourly.
/// Groups raw samples by (device_id, hour) and upserts into traffic_hourly.
/// Only processes samples that haven't been rolled up yet (hours not already present).
async fn rollup_traffic_hourly(pool: &SqlitePool) {
    let result = sqlx::query(
        r#"INSERT INTO traffic_hourly (device_id, hour, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples)
           SELECT
               device_id,
               strftime('%Y-%m-%dT%H:00:00', sampled_at) AS hour,
               CAST(AVG(tx_bps) AS INTEGER),
               CAST(AVG(rx_bps) AS INTEGER),
               MAX(tx_bps),
               MAX(rx_bps),
               COUNT(*)
           FROM traffic_samples
           GROUP BY device_id, hour
           ON CONFLICT(device_id, hour) DO UPDATE SET
               avg_tx_bps = excluded.avg_tx_bps,
               avg_rx_bps = excluded.avg_rx_bps,
               max_tx_bps = excluded.max_tx_bps,
               max_rx_bps = excluded.max_rx_bps,
               samples    = excluded.samples"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => {
            let rows = r.rows_affected();
            if rows > 0 {
                info!(
                    rows,
                    "retention: rolled up traffic_samples → traffic_hourly"
                );
            }
        }
        Err(e) => {
            error!("retention: hourly rollup failed: {e}");
        }
    }
}

/// Aggregate traffic_hourly into traffic_daily.
/// Groups hourly rows by (device_id, day) and upserts into traffic_daily.
async fn rollup_traffic_daily(pool: &SqlitePool) {
    let result = sqlx::query(
        r#"INSERT INTO traffic_daily (device_id, day, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, total_tx_bytes, total_rx_bytes, samples)
           SELECT
               device_id,
               strftime('%Y-%m-%d', hour) AS day,
               CAST(AVG(avg_tx_bps) AS INTEGER),
               CAST(AVG(avg_rx_bps) AS INTEGER),
               MAX(max_tx_bps),
               MAX(max_rx_bps),
               CAST(SUM(avg_tx_bps) * 3600 / 8 AS INTEGER),
               CAST(SUM(avg_rx_bps) * 3600 / 8 AS INTEGER),
               SUM(samples)
           FROM traffic_hourly
           GROUP BY device_id, day
           ON CONFLICT(device_id, day) DO UPDATE SET
               avg_tx_bps     = excluded.avg_tx_bps,
               avg_rx_bps     = excluded.avg_rx_bps,
               max_tx_bps     = excluded.max_tx_bps,
               max_rx_bps     = excluded.max_rx_bps,
               total_tx_bytes = excluded.total_tx_bytes,
               total_rx_bytes = excluded.total_rx_bytes,
               samples        = excluded.samples"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => {
            let rows = r.rows_affected();
            if rows > 0 {
                info!(rows, "retention: rolled up traffic_hourly → traffic_daily");
            }
        }
        Err(e) => {
            error!("retention: daily rollup failed: {e}");
        }
    }
}

/// Read the speedtest retention setting from the DB, falling back to 90 days.
async fn get_speedtest_retention_days(pool: &SqlitePool) -> u64 {
    match sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'speedtest_retention_days'",
    )
    .fetch_optional(pool)
    .await
    {
        Ok(Some(v)) => v.parse().unwrap_or(90),
        _ => 90,
    }
}

async fn delete_old_traffic_samples(pool: &SqlitePool, hours: u64) -> u64 {
    let interval = format!("-{hours} hours");
    match sqlx::query(r#"DELETE FROM traffic_samples WHERE sampled_at < datetime('now', ?)"#)
        .bind(&interval)
        .execute(pool)
        .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("retention: failed to delete old traffic_samples: {e}");
            0
        }
    }
}

async fn delete_old_agent_reports(pool: &SqlitePool, days: u64) -> u64 {
    let interval = format!("-{days} days");
    match sqlx::query(r#"DELETE FROM agent_reports WHERE reported_at < datetime('now', ?)"#)
        .bind(&interval)
        .execute(pool)
        .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("retention: failed to delete old agent_reports: {e}");
            0
        }
    }
}

async fn delete_old_device_events(pool: &SqlitePool, days: u64) -> u64 {
    let interval = format!("-{days} days");
    match sqlx::query(r#"DELETE FROM device_events WHERE occurred_at < datetime('now', ?)"#)
        .bind(&interval)
        .execute(pool)
        .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("retention: failed to delete old device_events: {e}");
            0
        }
    }
}

async fn delete_old_alerts(pool: &SqlitePool, days: u64) -> u64 {
    let interval = format!("-{days} days");
    match sqlx::query(
        r#"DELETE FROM alerts WHERE created_at < datetime('now', ?) AND acknowledged_at IS NOT NULL"#,
    )
    .bind(&interval)
    .execute(pool)
    .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("retention: failed to delete old acknowledged alerts: {e}");
            0
        }
    }
}

/// Check if VACUUM is needed (>7 days since last) and run it if so.
async fn maybe_vacuum(pool: &SqlitePool) {
    // Check last_vacuum_at from settings table.
    let last_vacuum: Option<String> =
        match sqlx::query_scalar(r#"SELECT value FROM settings WHERE key = 'last_vacuum_at'"#)
            .fetch_optional(pool)
            .await
        {
            Ok(v) => v,
            Err(e) => {
                error!("retention: failed to read last_vacuum_at: {e}");
                return;
            }
        };

    let should_vacuum = match last_vacuum {
        None => true,
        Some(ref ts) => {
            // Check if more than 7 days have passed.
            let row: Option<(i64,)> =
                sqlx::query_as(r#"SELECT 1 WHERE datetime(?, '+7 days') < datetime('now')"#)
                    .bind(ts)
                    .fetch_optional(pool)
                    .await
                    .unwrap_or(None);
            row.is_some()
        }
    };

    if !should_vacuum {
        return;
    }

    info!("retention: running weekly VACUUM");

    // Checkpoint WAL first.
    if let Err(e) = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await
    {
        error!("retention: WAL checkpoint failed: {e}");
    }

    // VACUUM.
    if let Err(e) = sqlx::query("VACUUM").execute(pool).await {
        error!("retention: VACUUM failed: {e}");
        return;
    }

    // Update last_vacuum_at.
    if let Err(e) = sqlx::query(
        r#"INSERT INTO settings (key, value) VALUES ('last_vacuum_at', datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = datetime('now')"#,
    )
    .execute(pool)
    .await
    {
        error!("retention: failed to update last_vacuum_at: {e}");
    } else {
        info!("retention: VACUUM completed successfully");
    }
}

/// Start the background retention task that runs every hour.
/// Each cycle: rollup traffic (samples → hourly → daily), cleanup old data, maybe VACUUM.
pub fn start_retention_task(pool: SqlitePool, config: RetentionConfig) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        interval.tick().await; // skip the immediate first tick
        loop {
            interval.tick().await;
            info!("retention: starting hourly rollup + cleanup");
            let (traffic, reports, events, alerts, speedtests) = run_cleanup(&pool, &config).await;
            if traffic + reports + events + alerts + speedtests > 0 {
                info!(
                    traffic_samples = traffic,
                    agent_reports = reports,
                    device_events = events,
                    alerts = alerts,
                    speedtests = speedtests,
                    "retention: cleanup completed"
                );
            }
            maybe_vacuum(&pool).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn setup_test_db() -> SqlitePool {
        db::init(":memory:").await.expect("test DB init failed")
    }

    fn default_config() -> RetentionConfig {
        RetentionConfig::default()
    }

    #[tokio::test]
    async fn test_retention_deletes_old_traffic() {
        let pool = setup_test_db().await;

        // Insert a device first.
        sqlx::query(
            r#"INSERT INTO devices (id, mac, first_seen_at, last_seen_at)
               VALUES ('dev1', 'AA:BB:CC:DD:EE:FF', datetime('now'), datetime('now'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a traffic sample from 72 hours ago (should be deleted with 48h retention).
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', datetime('now', '-72 hours'), 1000, 2000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (traffic, _, _, _, _) = run_cleanup(&pool, &config).await;
        assert_eq!(traffic, 1, "Should delete 1 old traffic sample");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_samples")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0, "No traffic samples should remain");
    }

    #[tokio::test]
    async fn test_retention_keeps_recent_traffic() {
        let pool = setup_test_db().await;

        sqlx::query(
            r#"INSERT INTO devices (id, mac, first_seen_at, last_seen_at)
               VALUES ('dev1', 'AA:BB:CC:DD:EE:FF', datetime('now'), datetime('now'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a recent traffic sample (1 hour ago — within 48h retention).
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', datetime('now', '-1 hours'), 1000, 2000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (traffic, _, _, _, _) = run_cleanup(&pool, &config).await;
        assert_eq!(traffic, 0, "Should not delete recent traffic sample");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_samples")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1, "Recent traffic sample should remain");
    }

    #[tokio::test]
    async fn test_retention_deletes_old_agent_reports() {
        let pool = setup_test_db().await;

        // Insert an agent.
        sqlx::query(
            r#"INSERT INTO agents (id, api_key_hash, name)
               VALUES ('agent1', '$2b$12$fake', 'test-agent')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a report from 10 days ago (should be deleted with 7d retention).
        sqlx::query(
            r#"INSERT INTO agent_reports (agent_id, reported_at)
               VALUES ('agent1', datetime('now', '-10 days'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (_, reports, _, _, _) = run_cleanup(&pool, &config).await;
        assert_eq!(reports, 1, "Should delete 1 old agent report");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM agent_reports")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0, "No agent reports should remain");
    }

    #[tokio::test]
    async fn test_retention_keeps_recent_agent_reports() {
        let pool = setup_test_db().await;

        sqlx::query(
            r#"INSERT INTO agents (id, api_key_hash, name)
               VALUES ('agent1', '$2b$12$fake', 'test-agent')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a report from 2 days ago (within 7d retention).
        sqlx::query(
            r#"INSERT INTO agent_reports (agent_id, reported_at)
               VALUES ('agent1', datetime('now', '-2 days'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (_, reports, _, _, _) = run_cleanup(&pool, &config).await;
        assert_eq!(reports, 0, "Should not delete recent agent report");
    }

    #[tokio::test]
    async fn test_retention_deletes_old_device_events() {
        let pool = setup_test_db().await;

        sqlx::query(
            r#"INSERT INTO devices (id, mac, first_seen_at, last_seen_at)
               VALUES ('dev1', 'AA:BB:CC:DD:EE:FF', datetime('now'), datetime('now'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert event from 45 days ago (should be deleted with 30d retention).
        sqlx::query(
            r#"INSERT INTO device_events (device_id, event_type, occurred_at)
               VALUES ('dev1', 'online', datetime('now', '-45 days'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (_, _, events, _, _) = run_cleanup(&pool, &config).await;
        assert_eq!(events, 1, "Should delete 1 old device event");
    }

    #[tokio::test]
    async fn test_retention_deletes_old_acknowledged_alerts() {
        let pool = setup_test_db().await;

        // Insert an old acknowledged alert (100 days ago).
        sqlx::query(
            r#"INSERT INTO alerts (id, type, message, created_at, acknowledged_at)
               VALUES ('alert1', 'test', 'old alert', datetime('now', '-100 days'), datetime('now', '-95 days'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (_, _, _, alerts, _) = run_cleanup(&pool, &config).await;
        assert_eq!(alerts, 1, "Should delete 1 old acknowledged alert");
    }

    #[tokio::test]
    async fn test_retention_keeps_unacknowledged_alerts() {
        let pool = setup_test_db().await;

        // Insert an old but unacknowledged alert (100 days ago).
        sqlx::query(
            r#"INSERT INTO alerts (id, type, message, created_at)
               VALUES ('alert1', 'test', 'old unacked alert', datetime('now', '-100 days'))"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        let (_, _, _, alerts, _) = run_cleanup(&pool, &config).await;
        assert_eq!(alerts, 0, "Should NOT delete unacknowledged alert");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM alerts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1, "Unacknowledged alert should remain");
    }

    async fn insert_device(pool: &SqlitePool, id: &str) {
        sqlx::query(
            r#"INSERT INTO devices (id, mac, first_seen_at, last_seen_at)
               VALUES (?, 'AA:BB:CC:DD:EE:FF', datetime('now'), datetime('now'))"#,
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_rollup_hourly_aggregates_samples() {
        let pool = setup_test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert two samples in the same hour.
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T10:05:00', 1000, 2000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T10:35:00', 3000, 4000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        rollup_traffic_hourly(&pool).await;

        let row: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples FROM traffic_hourly WHERE device_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.0, 2000, "avg_tx_bps = (1000+3000)/2");
        assert_eq!(row.1, 3000, "avg_rx_bps = (2000+4000)/2");
        assert_eq!(row.2, 3000, "max_tx_bps");
        assert_eq!(row.3, 4000, "max_rx_bps");
        assert_eq!(row.4, 2, "samples count");
    }

    #[tokio::test]
    async fn test_rollup_hourly_upserts_on_rerun() {
        let pool = setup_test_db().await;
        insert_device(&pool, "dev1").await;

        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T10:05:00', 1000, 2000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        rollup_traffic_hourly(&pool).await;

        // Add another sample in the same hour and re-run.
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T10:45:00', 5000, 6000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        rollup_traffic_hourly(&pool).await;

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM traffic_hourly WHERE device_id = 'dev1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 1, "Should still be one hourly row (upsert)");

        let row: (i64,) =
            sqlx::query_as("SELECT samples FROM traffic_hourly WHERE device_id = 'dev1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, 2, "Samples count should be updated");
    }

    #[tokio::test]
    async fn test_rollup_daily_aggregates_hourly() {
        let pool = setup_test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert samples across two hours on the same day.
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T10:05:00', 1000, 2000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', '2025-01-15T11:05:00', 3000, 4000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // First rollup to hourly, then to daily.
        rollup_traffic_hourly(&pool).await;
        rollup_traffic_daily(&pool).await;

        let row: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples FROM traffic_daily WHERE device_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.0, 2000, "daily avg_tx_bps = avg of hourly avgs");
        assert_eq!(row.1, 3000, "daily avg_rx_bps = avg of hourly avgs");
        assert_eq!(row.2, 3000, "daily max_tx_bps");
        assert_eq!(row.3, 4000, "daily max_rx_bps");
        assert_eq!(row.4, 2, "total samples across hours");
    }

    #[tokio::test]
    async fn test_rollup_daily_calculates_total_bytes() {
        let pool = setup_test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert hourly data directly to test byte calculation.
        sqlx::query(
            r#"INSERT INTO traffic_hourly (device_id, hour, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples)
               VALUES ('dev1', '2025-01-15T10:00:00', 8000, 16000, 8000, 16000, 10)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        rollup_traffic_daily(&pool).await;

        let row: (i64, i64) = sqlx::query_as(
            "SELECT total_tx_bytes, total_rx_bytes FROM traffic_daily WHERE device_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        // total_tx_bytes = avg_tx_bps * 3600 / 8 = 8000 * 3600 / 8 = 3_600_000
        assert_eq!(row.0, 3_600_000, "total_tx_bytes = avg_bps * 3600 / 8");
        // total_rx_bytes = avg_rx_bps * 3600 / 8 = 16000 * 3600 / 8 = 7_200_000
        assert_eq!(row.1, 7_200_000, "total_rx_bytes = avg_bps * 3600 / 8");
    }

    #[tokio::test]
    async fn test_rollup_runs_before_cleanup() {
        let pool = setup_test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert a traffic sample from 72 hours ago (will be cleaned up).
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
               VALUES ('dev1', datetime('now', '-72 hours'), 5000, 10000, 'test')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let config = default_config();
        run_cleanup(&pool, &config).await;

        // The sample should be deleted...
        let sample_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_samples")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(sample_count.0, 0, "Old sample should be deleted");

        // ...but the hourly rollup should have captured it first.
        let hourly_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_hourly")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            hourly_count.0, 1,
            "Hourly rollup should have captured the sample before cleanup"
        );
    }
}
