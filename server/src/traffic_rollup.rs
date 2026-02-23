use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{error, info};

/// Aggregate traffic_samples into traffic_hourly for completed hours.
/// Uses INSERT ... ON CONFLICT to be idempotent.
async fn rollup_hourly(pool: &SqlitePool) -> u64 {
    // Aggregate all completed hours (not the current partial hour).
    let result = sqlx::query(
        r#"INSERT INTO traffic_hourly (device_id, hour, avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps, samples)
           SELECT
               device_id,
               strftime('%Y-%m-%dT%H:00:00', sampled_at) AS hour,
               CAST(AVG(rx_bps) AS INTEGER),
               CAST(AVG(tx_bps) AS INTEGER),
               MAX(rx_bps),
               MAX(tx_bps),
               COUNT(*)
           FROM traffic_samples
           WHERE sampled_at < strftime('%Y-%m-%dT%H:00:00', 'now')
           GROUP BY device_id, hour
           ON CONFLICT(device_id, hour) DO UPDATE SET
               avg_rx_bps = excluded.avg_rx_bps,
               avg_tx_bps = excluded.avg_tx_bps,
               max_rx_bps = excluded.max_rx_bps,
               max_tx_bps = excluded.max_tx_bps,
               samples    = excluded.samples"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("traffic_rollup: hourly aggregation failed: {e}");
            0
        }
    }
}

/// Aggregate traffic_hourly into traffic_daily for completed days.
async fn rollup_daily(pool: &SqlitePool) -> u64 {
    let result = sqlx::query(
        r#"INSERT INTO traffic_daily (device_id, day, avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps, total_rx_bytes, total_tx_bytes, samples)
           SELECT
               device_id,
               strftime('%Y-%m-%d', hour) AS day,
               CAST(AVG(avg_rx_bps) AS INTEGER),
               CAST(AVG(avg_tx_bps) AS INTEGER),
               MAX(max_rx_bps),
               MAX(max_tx_bps),
               -- Estimate total bytes: avg bps * 3600 seconds per hour * number of hours / 8 bits
               CAST(SUM(avg_rx_bps) * 3600 / 8 AS INTEGER),
               CAST(SUM(avg_tx_bps) * 3600 / 8 AS INTEGER),
               SUM(samples)
           FROM traffic_hourly
           WHERE hour < strftime('%Y-%m-%dT00:00:00', 'now')
           GROUP BY device_id, day
           ON CONFLICT(device_id, day) DO UPDATE SET
               avg_rx_bps     = excluded.avg_rx_bps,
               avg_tx_bps     = excluded.avg_tx_bps,
               max_rx_bps     = excluded.max_rx_bps,
               max_tx_bps     = excluded.max_tx_bps,
               total_rx_bytes = excluded.total_rx_bytes,
               total_tx_bytes = excluded.total_tx_bytes,
               samples        = excluded.samples"#,
    )
    .execute(pool)
    .await;

    match result {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("traffic_rollup: daily aggregation failed: {e}");
            0
        }
    }
}

/// Run one cycle of traffic rollup: samples → hourly → daily.
pub async fn run_rollup(pool: &SqlitePool) -> (u64, u64) {
    let hourly = rollup_hourly(pool).await;
    let daily = rollup_daily(pool).await;
    (hourly, daily)
}

/// Start the background traffic rollup task that runs every 5 minutes.
pub fn start_traffic_rollup_task(pool: SqlitePool) {
    tokio::spawn(async move {
        // Run an initial rollup shortly after startup.
        tokio::time::sleep(Duration::from_secs(30)).await;
        let (h, d) = run_rollup(&pool).await;
        if h + d > 0 {
            info!(
                hourly = h,
                daily = d,
                "traffic_rollup: initial rollup completed"
            );
        }

        let mut interval = tokio::time::interval(Duration::from_secs(300));
        interval.tick().await; // skip immediate tick
        loop {
            interval.tick().await;
            let (h, d) = run_rollup(&pool).await;
            if h + d > 0 {
                info!(hourly = h, daily = d, "traffic_rollup: rollup completed");
            }
        }
    });
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
            r#"INSERT INTO devices (id, mac, first_seen_at, last_seen_at)
               VALUES (?, 'AA:BB:CC:DD:EE:FF', datetime('now'), datetime('now'))"#,
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn insert_sample(pool: &SqlitePool, device_id: &str, ts: &str, rx: i64, tx: i64) {
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, ?, ?, ?, 'test')"#,
        )
        .bind(device_id)
        .bind(ts)
        .bind(rx)
        .bind(tx)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_hourly_rollup() {
        let pool = test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert samples for a completed hour (2 hours ago).
        insert_sample(&pool, "dev1", "2024-01-01T10:05:00", 1000, 500).await;
        insert_sample(&pool, "dev1", "2024-01-01T10:15:00", 2000, 1000).await;
        insert_sample(&pool, "dev1", "2024-01-01T10:45:00", 3000, 1500).await;

        let (hourly, _) = run_rollup(&pool).await;
        assert!(hourly > 0, "Should produce hourly rollup rows");

        let row: (i64, i64, i64, i64, i64) = sqlx::query_as(
            "SELECT avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps, samples FROM traffic_hourly WHERE device_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(
            row.0, 2000,
            "avg_rx_bps should be (1000+2000+3000)/3 = 2000"
        );
        assert_eq!(row.1, 1000, "avg_tx_bps should be (500+1000+1500)/3 = 1000");
        assert_eq!(row.2, 3000, "max_rx_bps");
        assert_eq!(row.3, 1500, "max_tx_bps");
        assert_eq!(row.4, 3, "3 samples");
    }

    #[tokio::test]
    async fn test_daily_rollup() {
        let pool = test_db().await;
        insert_device(&pool, "dev1").await;

        // Insert hourly rows for a completed day.
        sqlx::query(
            r#"INSERT INTO traffic_hourly (device_id, hour, avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps, samples)
               VALUES ('dev1', '2024-01-01T10:00:00', 1000, 500, 2000, 1000, 10)"#,
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            r#"INSERT INTO traffic_hourly (device_id, hour, avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps, samples)
               VALUES ('dev1', '2024-01-01T14:00:00', 3000, 1500, 4000, 2000, 20)"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let (_, daily) = run_rollup(&pool).await;
        assert!(daily > 0, "Should produce daily rollup rows");

        let row: (i64, i64, i64, i64) = sqlx::query_as(
            "SELECT avg_rx_bps, avg_tx_bps, max_rx_bps, max_tx_bps FROM traffic_daily WHERE device_id = 'dev1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();

        assert_eq!(row.0, 2000, "avg_rx_bps should be (1000+3000)/2 = 2000");
        assert_eq!(row.1, 1000, "avg_tx_bps should be (500+1500)/2 = 1000");
        assert_eq!(row.2, 4000, "max_rx_bps");
        assert_eq!(row.3, 2000, "max_tx_bps");
    }

    #[tokio::test]
    async fn test_rollup_idempotent() {
        let pool = test_db().await;
        insert_device(&pool, "dev1").await;
        insert_sample(&pool, "dev1", "2024-01-01T10:05:00", 1000, 500).await;

        // Run twice — should not create duplicates.
        run_rollup(&pool).await;
        run_rollup(&pool).await;

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM traffic_hourly WHERE device_id = 'dev1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 1, "Should have exactly 1 hourly row (idempotent)");
    }
}
