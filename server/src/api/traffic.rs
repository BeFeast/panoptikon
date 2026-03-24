use super::error::AppError;
use crate::api::AppState;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::error;

#[derive(Serialize)]
pub struct TrafficHistoryPoint {
    pub minute: String,
    pub rx_bps: i64,
    pub tx_bps: i64,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub minutes: Option<i64>,
}

/// GET /api/v1/traffic/history?minutes=60
///
/// Returns per-minute aggregated traffic (sum of rx_bps, tx_bps) for the
/// requested time window. Default: 60 minutes. Max: 1440 (24 hours).
pub async fn history(
    State(state): State<AppState>,
    Query(q): Query<HistoryQuery>,
) -> Json<Vec<TrafficHistoryPoint>> {
    let minutes = q.minutes.unwrap_or(60).clamp(1, 1440);

    let rows: Vec<(String, i64, i64)> = sqlx::query_as(
        r#"SELECT
             strftime('%Y-%m-%dT%H:%M:00', sampled_at) AS minute,
             COALESCE(SUM(rx_bps), 0) AS rx_bps,
             COALESCE(SUM(tx_bps), 0) AS tx_bps
           FROM traffic_samples
           WHERE sampled_at >= datetime('now', '-' || CAST(? AS TEXT) || ' minutes')
           GROUP BY minute
           ORDER BY minute ASC"#,
    )
    .bind(minutes)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(
        rows.into_iter()
            .map(|(minute, rx_bps, tx_bps)| TrafficHistoryPoint {
                minute,
                rx_bps,
                tx_bps,
            })
            .collect(),
    )
}

// ─── Per-device traffic history ──────────────────────────

#[derive(Serialize)]
pub struct DeviceTrafficPoint {
    pub time: String,
    pub rx_bps: i64,
    pub tx_bps: i64,
    pub max_rx_bps: Option<i64>,
    pub max_tx_bps: Option<i64>,
}

#[derive(Deserialize)]
pub struct DeviceTrafficQuery {
    /// Time range: "1h", "24h", "7d", "30d"
    pub range: Option<String>,
}

/// GET /api/v1/devices/:id/traffic?range=1h
///
/// Returns per-device traffic history for the given time range.
/// - 1h: raw samples (per-minute), from traffic_samples
/// - 24h: hourly aggregates, from traffic_hourly
/// - 7d: hourly aggregates, from traffic_hourly
/// - 30d: daily aggregates, from traffic_daily
pub async fn device_traffic(
    State(state): State<AppState>,
    Path(device_id): Path<String>,
    Query(q): Query<DeviceTrafficQuery>,
) -> Result<Json<Vec<DeviceTrafficPoint>>, AppError> {
    let range = q.range.as_deref().unwrap_or("1h");

    let points = match range {
        "1h" => query_samples_minutes(&state, &device_id, 60).await,
        "24h" => query_hourly(&state, &device_id, 24).await,
        "7d" => query_hourly(&state, &device_id, 168).await,
        "30d" => query_daily(&state, &device_id, 30).await,
        _ => query_samples_minutes(&state, &device_id, 60).await,
    };

    match points {
        Ok(p) => Ok(Json(p)),
        Err(e) => {
            error!("device_traffic query failed: {e}");
            Err(AppError::Internal(e.to_string()))
        }
    }
}

async fn query_samples_minutes(
    state: &AppState,
    device_id: &str,
    minutes: i64,
) -> Result<Vec<DeviceTrafficPoint>, sqlx::Error> {
    let rows: Vec<(String, i64, i64)> = sqlx::query_as(
        r#"SELECT
             strftime('%Y-%m-%dT%H:%M:00', sampled_at) AS minute,
             COALESCE(SUM(rx_bps), 0),
             COALESCE(SUM(tx_bps), 0)
           FROM traffic_samples
           WHERE device_id = ?
             AND sampled_at >= datetime('now', '-' || CAST(? AS TEXT) || ' minutes')
           GROUP BY minute
           ORDER BY minute ASC"#,
    )
    .bind(device_id)
    .bind(minutes)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(time, rx_bps, tx_bps)| DeviceTrafficPoint {
            time,
            rx_bps,
            tx_bps,
            max_rx_bps: None,
            max_tx_bps: None,
        })
        .collect())
}

async fn query_hourly(
    state: &AppState,
    device_id: &str,
    hours: i64,
) -> Result<Vec<DeviceTrafficPoint>, sqlx::Error> {
    let rows: Vec<(String, i64, i64, i64, i64)> = sqlx::query_as(
        r#"SELECT
             hour,
             COALESCE(avg_rx_bps, 0),
             COALESCE(avg_tx_bps, 0),
             COALESCE(max_rx_bps, 0),
             COALESCE(max_tx_bps, 0)
           FROM traffic_hourly
           WHERE device_id = ?
             AND hour >= datetime('now', '-' || CAST(? AS TEXT) || ' hours')
           ORDER BY hour ASC"#,
    )
    .bind(device_id)
    .bind(hours)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(time, rx_bps, tx_bps, max_rx, max_tx)| DeviceTrafficPoint {
                time,
                rx_bps,
                tx_bps,
                max_rx_bps: Some(max_rx),
                max_tx_bps: Some(max_tx),
            },
        )
        .collect())
}

async fn query_daily(
    state: &AppState,
    device_id: &str,
    days: i64,
) -> Result<Vec<DeviceTrafficPoint>, sqlx::Error> {
    let rows: Vec<(String, i64, i64, i64, i64)> = sqlx::query_as(
        r#"SELECT
             day,
             COALESCE(avg_rx_bps, 0),
             COALESCE(avg_tx_bps, 0),
             COALESCE(max_rx_bps, 0),
             COALESCE(max_tx_bps, 0)
           FROM traffic_daily
           WHERE device_id = ?
             AND day >= date('now', '-' || CAST(? AS TEXT) || ' days')
           ORDER BY day ASC"#,
    )
    .bind(device_id)
    .bind(days)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(time, rx_bps, tx_bps, max_rx, max_tx)| DeviceTrafficPoint {
                time,
                rx_bps,
                tx_bps,
                max_rx_bps: Some(max_rx),
                max_tx_bps: Some(max_tx),
            },
        )
        .collect())
}

#[cfg(test)]
mod tests {
    use crate::db;
    use sqlx::SqlitePool;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: insert a device and return its id.
    async fn insert_test_device(pool: &SqlitePool) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, icon, is_known, is_favorite, first_seen_at, last_seen_at, is_online)
               VALUES (?, '00:11:22:33:44:55', 'test-device', 'desktop', 0, 0, datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&id)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert a traffic sample at a given time.
    async fn insert_sample(
        pool: &SqlitePool,
        device_id: &str,
        sampled_at: &str,
        rx_bps: i64,
        tx_bps: i64,
    ) {
        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, ?, ?, ?, 'test')"#,
        )
        .bind(device_id)
        .bind(sampled_at)
        .bind(rx_bps)
        .bind(tx_bps)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn test_traffic_history_empty() {
        let pool = test_db().await;

        let rows: Vec<(String, i64, i64)> = sqlx::query_as(
            r#"SELECT
                 strftime('%Y-%m-%dT%H:%M:00', sampled_at) AS minute,
                 COALESCE(SUM(rx_bps), 0) AS rx_bps,
                 COALESCE(SUM(tx_bps), 0) AS tx_bps
               FROM traffic_samples
               WHERE sampled_at >= datetime('now', '-60 minutes')
               GROUP BY minute
               ORDER BY minute ASC"#,
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert!(rows.is_empty(), "Empty DB should return no traffic history");
    }

    #[tokio::test]
    async fn test_traffic_history_aggregates() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool).await;

        // Insert two samples in the same minute — they should be summed.
        let now = chrono::Utc::now();
        let ts1 = now.format("%Y-%m-%dT%H:%M:10").to_string();
        let ts2 = now.format("%Y-%m-%dT%H:%M:30").to_string();

        insert_sample(&pool, &device_id, &ts1, 1000, 2000).await;
        insert_sample(&pool, &device_id, &ts2, 3000, 4000).await;

        let rows: Vec<(String, i64, i64)> = sqlx::query_as(
            r#"SELECT
                 strftime('%Y-%m-%dT%H:%M:00', sampled_at) AS minute,
                 COALESCE(SUM(rx_bps), 0) AS rx_bps,
                 COALESCE(SUM(tx_bps), 0) AS tx_bps
               FROM traffic_samples
               WHERE sampled_at >= datetime('now', '-60 minutes')
               GROUP BY minute
               ORDER BY minute ASC"#,
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 1, "Two samples in same minute → one row");
        assert_eq!(rows[0].1, 4000, "rx_bps should be summed: 1000 + 3000");
        assert_eq!(rows[0].2, 6000, "tx_bps should be summed: 2000 + 4000");
    }

    #[tokio::test]
    async fn test_traffic_history_ordering() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool).await;

        let now = chrono::Utc::now();
        // Two different minutes — insert in reverse order to test ASC sorting.
        let earlier = (now - chrono::Duration::minutes(5))
            .format("%Y-%m-%dT%H:%M:00")
            .to_string();
        let later = now.format("%Y-%m-%dT%H:%M:00").to_string();

        // Insert later first, earlier second — ASC should still sort correctly.
        insert_sample(&pool, &device_id, &later, 100, 200).await;
        insert_sample(&pool, &device_id, &earlier, 300, 400).await;

        let rows: Vec<(String, i64, i64)> = sqlx::query_as(
            r#"SELECT
                 strftime('%Y-%m-%dT%H:%M:00', sampled_at) AS minute,
                 COALESCE(SUM(rx_bps), 0) AS rx_bps,
                 COALESCE(SUM(tx_bps), 0) AS tx_bps
               FROM traffic_samples
               WHERE sampled_at >= datetime('now', '-60 minutes')
               GROUP BY minute
               ORDER BY minute ASC"#,
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert_eq!(rows.len(), 2, "Two different minutes → two rows");
        assert!(
            rows[0].0 < rows[1].0,
            "Rows should be in ascending order: {} < {}",
            rows[0].0,
            rows[1].0
        );
    }
}
