use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{error, info};

/// Aggregate `traffic_samples` into `traffic_hourly` (every 5 min)
/// and `traffic_hourly` into `traffic_daily` (every hour).
pub fn start_traffic_rollup_task(pool: SqlitePool) {
    tokio::spawn(async move {
        // Run the first hourly rollup right away so data is immediately available.
        rollup_hourly(&pool).await;
        rollup_daily(&pool).await;

        let mut tick_count: u64 = 0;
        let mut interval = tokio::time::interval(Duration::from_secs(300)); // 5 minutes
        interval.tick().await; // skip immediate tick
        loop {
            interval.tick().await;
            tick_count += 1;

            rollup_hourly(&pool).await;

            // Run daily rollup every 12th tick (= every 60 minutes).
            if tick_count % 12 == 0 {
                rollup_daily(&pool).await;
            }
        }
    });
}

/// Aggregate raw traffic_samples into traffic_hourly.
/// Uses INSERT OR REPLACE with the unique (device_id, hour) index.
/// Only processes the last 49 hours to cover the full retention window.
async fn rollup_hourly(pool: &SqlitePool) {
    let result = sqlx::query(
        r#"INSERT OR REPLACE INTO traffic_hourly (device_id, hour, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples)
           SELECT
             device_id,
             strftime('%Y-%m-%dT%H:00:00', sampled_at) AS hour,
             CAST(AVG(tx_bps) AS INTEGER),
             CAST(AVG(rx_bps) AS INTEGER),
             MAX(tx_bps),
             MAX(rx_bps),
             COUNT(*)
           FROM traffic_samples
           WHERE sampled_at >= datetime('now', '-49 hours')
           GROUP BY device_id, hour"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => {
            let rows = r.rows_affected();
            if rows > 0 {
                info!(rows, "traffic_rollup: hourly aggregation complete");
            }
        }
        Err(e) => error!("traffic_rollup: hourly aggregation failed: {e}"),
    }
}

/// Aggregate traffic_hourly into traffic_daily.
/// Only processes the last 31 days.
async fn rollup_daily(pool: &SqlitePool) {
    let result = sqlx::query(
        r#"INSERT OR REPLACE INTO traffic_daily (device_id, day, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, total_tx_bytes, total_rx_bytes, samples)
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
           WHERE hour >= datetime('now', '-31 days')
           GROUP BY device_id, day"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => {
            let rows = r.rows_affected();
            if rows > 0 {
                info!(rows, "traffic_rollup: daily aggregation complete");
            }
        }
        Err(e) => error!("traffic_rollup: daily aggregation failed: {e}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn test_db() -> SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    async fn insert_device(pool: &SqlitePool, id: &str) {
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, icon, is_known, is_favorite, first_seen_at, last_seen_at, is_online)
               VALUES (?, 'AA:BB:CC:DD:EE:FF', 'test', 'desktop', 0, 0, datetime('now'), datetime('now'), 1)"#,
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_hourly_rollup() {
        let pool = test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert samples in the current hour.
        for i in 0..5 {
            let offset = format!("-{} minutes", i * 10);
            sqlx::query(
                r#"INSERT INTO traffic_samples (device_id, sampled_at, tx_bps, rx_bps, source)
                   VALUES ('dev1', datetime('now', ?), 1000, 2000, 'test')"#,
            )
            .bind(&offset)
            .execute(&pool)
            .await
            .unwrap();
        }

        rollup_hourly(&pool).await;

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_hourly")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(count.0 >= 1, "Should have at least 1 hourly row");

        let row: (i64, i64) =
            sqlx::query_as("SELECT avg_tx_bps, avg_rx_bps FROM traffic_hourly LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, 1000, "avg_tx_bps should be 1000");
        assert_eq!(row.1, 2000, "avg_rx_bps should be 2000");
    }

    #[tokio::test]
    async fn test_daily_rollup() {
        let pool = test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert hourly rows for today.
        for i in 0..3 {
            let offset = format!("-{} hours", i);
            sqlx::query(
                r#"INSERT INTO traffic_hourly (device_id, hour, avg_tx_bps, avg_rx_bps, max_tx_bps, max_rx_bps, samples)
                   VALUES ('dev1', datetime('now', ?), 1000, 2000, 1500, 3000, 60)"#,
            )
            .bind(&offset)
            .execute(&pool)
            .await
            .unwrap();
        }

        rollup_daily(&pool).await;

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM traffic_daily")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(count.0 >= 1, "Should have at least 1 daily row");
    }
}
