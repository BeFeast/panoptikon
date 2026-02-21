use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{error, info};

use crate::config::RetentionConfig;

/// Run one cycle of retention cleanup: delete old rows from traffic_samples,
/// agent_reports, device_events, and acknowledged alerts.
/// Returns the counts of deleted rows.
pub async fn run_cleanup(pool: &SqlitePool, config: &RetentionConfig) -> (u64, u64, u64, u64) {
    let traffic = delete_old_traffic_samples(pool, config.traffic_samples_hours).await;
    let reports = delete_old_agent_reports(pool, config.agent_reports_days).await;
    let events = delete_old_device_events(pool, config.device_events_days).await;
    let alerts = delete_old_alerts(pool, config.alerts_days).await;
    (traffic, reports, events, alerts)
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
pub fn start_retention_task(pool: SqlitePool, config: RetentionConfig) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        interval.tick().await; // skip the immediate first tick
        loop {
            interval.tick().await;
            info!("retention: starting hourly cleanup");
            let (traffic, reports, events, alerts) = run_cleanup(&pool, &config).await;
            if traffic + reports + events + alerts > 0 {
                info!(
                    traffic_samples = traffic,
                    agent_reports = reports,
                    device_events = events,
                    alerts = alerts,
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
        let (traffic, _, _, _) = run_cleanup(&pool, &config).await;
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
        let (traffic, _, _, _) = run_cleanup(&pool, &config).await;
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
        let (_, reports, _, _) = run_cleanup(&pool, &config).await;
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
        let (_, reports, _, _) = run_cleanup(&pool, &config).await;
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
        let (_, _, events, _) = run_cleanup(&pool, &config).await;
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
        let (_, _, _, alerts) = run_cleanup(&pool, &config).await;
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
        let (_, _, _, alerts) = run_cleanup(&pool, &config).await;
        assert_eq!(alerts, 0, "Should NOT delete unacknowledged alert");

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM alerts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1, "Unacknowledged alert should remain");
    }
}
