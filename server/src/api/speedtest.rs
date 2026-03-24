use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tracing::error;

use super::error::AppError;
use super::AppState;

/// A single row from the speedtest_history table.
#[derive(Debug, Serialize, Deserialize)]
pub struct SpeedTestHistoryEntry {
    pub id: i64,
    pub tested_at: String,
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub ping_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub isp: String,
    pub server_name: String,
    pub result_url: Option<String>,
}

/// Response for the history endpoint.
#[derive(Debug, Serialize)]
pub struct SpeedTestHistoryResponse {
    pub items: Vec<SpeedTestHistoryEntry>,
    pub total: i64,
}

/// Query parameters for the history endpoint.
#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// GET /api/v1/router/speedtest/history — paginated speedtest history.
pub async fn history(
    State(state): State<AppState>,
    Query(params): Query<HistoryQuery>,
) -> Result<Json<SpeedTestHistoryResponse>, AppError> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM speedtest_history")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("speedtest history count failed: {e}");
            AppError::Internal(e.to_string())
        })?;

    let items = sqlx::query_as::<_, (i64, String, f64, f64, f64, f64, f64, String, String, Option<String>)>(
        r#"SELECT id, tested_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss, isp, server_name, result_url
           FROM speedtest_history
           ORDER BY tested_at DESC
           LIMIT ? OFFSET ?"#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("speedtest history query failed: {e}");
        AppError::Internal(e.to_string())
    })?
    .into_iter()
    .map(|(id, tested_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss, isp, server_name, result_url)| {
        SpeedTestHistoryEntry {
            id,
            tested_at,
            download_mbps,
            upload_mbps,
            ping_ms,
            jitter_ms,
            packet_loss,
            isp,
            server_name,
            result_url,
        }
    })
    .collect();

    Ok(Json(SpeedTestHistoryResponse { items, total }))
}

/// Parameters for persisting a speedtest result.
pub struct SpeedTestPersistParams<'a> {
    pub download_mbps: f64,
    pub upload_mbps: f64,
    pub ping_ms: f64,
    pub jitter_ms: f64,
    pub packet_loss: f64,
    pub isp: &'a str,
    pub server_name: &'a str,
    pub result_url: Option<&'a str>,
}

/// Persist a speedtest result to the database.
pub async fn persist_result(pool: &SqlitePool, params: SpeedTestPersistParams<'_>) {
    if let Err(e) = sqlx::query(
        r#"INSERT INTO speedtest_history
           (tested_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss, isp, server_name, result_url)
           VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(params.download_mbps)
    .bind(params.upload_mbps)
    .bind(params.ping_ms)
    .bind(params.jitter_ms)
    .bind(params.packet_loss)
    .bind(params.isp)
    .bind(params.server_name)
    .bind(params.result_url)
    .execute(pool)
    .await
    {
        error!("Failed to persist speedtest result: {e}");
    }
}

/// Delete speedtest history older than the given number of days.
pub async fn delete_old_speedtests(pool: &SqlitePool, days: u64) -> u64 {
    let interval = format!("-{days} days");
    match sqlx::query(r#"DELETE FROM speedtest_history WHERE tested_at < datetime('now', ?)"#)
        .bind(&interval)
        .execute(pool)
        .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            error!("retention: failed to delete old speedtest_history: {e}");
            0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn setup_test_db() -> SqlitePool {
        db::init(":memory:").await.expect("test DB init failed")
    }

    #[tokio::test]
    async fn test_persist_and_count() {
        let pool = setup_test_db().await;

        persist_result(
            &pool,
            SpeedTestPersistParams {
                download_mbps: 100.5,
                upload_mbps: 50.2,
                ping_ms: 12.3,
                jitter_ms: 1.1,
                packet_loss: 0.0,
                isp: "TestISP",
                server_name: "Server1",
                result_url: Some("https://example.com"),
            },
        )
        .await;
        persist_result(
            &pool,
            SpeedTestPersistParams {
                download_mbps: 95.0,
                upload_mbps: 48.0,
                ping_ms: 14.0,
                jitter_ms: 1.5,
                packet_loss: 0.1,
                isp: "TestISP",
                server_name: "Server2",
                result_url: None,
            },
        )
        .await;

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM speedtest_history")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    #[tokio::test]
    async fn test_delete_old_speedtests() {
        let pool = setup_test_db().await;

        // Insert an old result (100 days ago).
        sqlx::query(
            r#"INSERT INTO speedtest_history
               (tested_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss, isp, server_name)
               VALUES (datetime('now', '-100 days'), 100.0, 50.0, 10.0, 1.0, 0.0, 'ISP', 'Server')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        // Insert a recent result (1 hour ago).
        sqlx::query(
            r#"INSERT INTO speedtest_history
               (tested_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss, isp, server_name)
               VALUES (datetime('now', '-1 hours'), 100.0, 50.0, 10.0, 1.0, 0.0, 'ISP', 'Server')"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        let deleted = delete_old_speedtests(&pool, 90).await;
        assert_eq!(deleted, 1, "Should delete 1 old speedtest result");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM speedtest_history")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1, "Recent result should remain");
    }

    #[tokio::test]
    async fn test_persist_result_url_optional() {
        let pool = setup_test_db().await;

        persist_result(
            &pool,
            SpeedTestPersistParams {
                download_mbps: 100.0,
                upload_mbps: 50.0,
                ping_ms: 10.0,
                jitter_ms: 1.0,
                packet_loss: 0.0,
                isp: "ISP",
                server_name: "Server",
                result_url: None,
            },
        )
        .await;

        let url: Option<String> =
            sqlx::query_scalar("SELECT result_url FROM speedtest_history LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(url.is_none());
    }
}
