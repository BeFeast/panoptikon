use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;

// ─── Types ───────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DnsQueryEntry {
    pub id: i64,
    pub device_id: Option<String>,
    pub client_ip: String,
    pub domain: String,
    pub query_type: String,
    pub response_code: String,
    pub blocked: bool,
    pub response_time_ms: Option<i64>,
    pub upstream: Option<String>,
    pub queried_at: String,
    pub device_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DnsQueryLogResponse {
    pub items: Vec<DnsQueryEntry>,
    pub total: i64,
    pub page: i64,
    pub per_page: i64,
}

#[derive(Debug, Serialize)]
pub struct DnsQueryStats {
    pub total_queries: i64,
    pub blocked_queries: i64,
    pub unique_domains: i64,
    pub unique_clients: i64,
    pub top_queried_domains: Vec<DomainCount>,
    pub top_blocked_domains: Vec<DomainCount>,
    pub per_device_stats: Vec<DeviceQueryStats>,
    pub queries_over_time: Vec<TimeSeriesPoint>,
}

#[derive(Debug, Serialize)]
pub struct DomainCount {
    pub domain: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct DeviceQueryStats {
    pub device_id: Option<String>,
    pub client_ip: String,
    pub device_name: Option<String>,
    pub total_queries: i64,
    pub blocked_queries: i64,
}

#[derive(Debug, Serialize)]
pub struct TimeSeriesPoint {
    pub time: String,
    pub total: i64,
    pub blocked: i64,
}

/// Row type for per-device query stats: (device_id, client_ip, device_name, total, blocked).
type DeviceStatsRow = (Option<String>, String, Option<String>, i64, i64);

// ─── Query parameters ────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct DnsQueryLogQuery {
    pub page: Option<i64>,
    pub per_page: Option<i64>,
    pub device_id: Option<String>,
    pub domain: Option<String>,
    pub query_type: Option<String>,
    pub blocked: Option<bool>,
    pub hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DnsStatsQuery {
    pub hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct IngestDnsQuery {
    pub client_ip: String,
    pub domain: String,
    pub query_type: Option<String>,
    pub response_code: Option<String>,
    pub blocked: Option<bool>,
    pub response_time_ms: Option<i64>,
    pub upstream: Option<String>,
    pub queried_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IngestDnsRequest {
    pub queries: Vec<IngestDnsQuery>,
}

#[derive(Debug, Serialize)]
pub struct IngestDnsResponse {
    pub inserted: u64,
}

// ─── Internal row types ──────────────────────────────────

#[derive(sqlx::FromRow)]
struct DnsQueryRow {
    id: i64,
    device_id: Option<String>,
    client_ip: String,
    domain: String,
    query_type: String,
    response_code: String,
    blocked: i32,
    response_time_ms: Option<i64>,
    upstream: Option<String>,
    queried_at: String,
    device_name: Option<String>,
}

// ─── Handlers ────────────────────────────────────────────

/// GET /api/v1/dns-queries — list DNS query log entries with pagination and filters.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<DnsQueryLogQuery>,
) -> Result<Json<DnsQueryLogResponse>, StatusCode> {
    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(50).clamp(1, 200);
    let offset = (page - 1) * per_page;
    let hours = params.hours.unwrap_or(24).clamp(1, 168); // max 7 days
    let interval = format!("-{hours} hours");

    // Build WHERE clauses dynamically.
    let mut conditions = vec!["q.queried_at >= datetime('now', ?)".to_string()];
    let mut count_conditions = vec!["queried_at >= datetime('now', ?)".to_string()];

    if params.device_id.is_some() {
        conditions.push("q.device_id = ?".to_string());
        count_conditions.push("device_id = ?".to_string());
    }
    if params.domain.is_some() {
        conditions.push("q.domain LIKE '%' || ? || '%'".to_string());
        count_conditions.push("domain LIKE '%' || ? || '%'".to_string());
    }
    if params.query_type.is_some() {
        conditions.push("q.query_type = ?".to_string());
        count_conditions.push("query_type = ?".to_string());
    }
    if params.blocked.is_some() {
        conditions.push("q.blocked = ?".to_string());
        count_conditions.push("blocked = ?".to_string());
    }

    let where_clause = conditions.join(" AND ");
    let count_where = count_conditions.join(" AND ");

    // Count query.
    let count_sql = format!("SELECT COUNT(*) FROM dns_query_log WHERE {count_where}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(&interval);
    if let Some(ref device_id) = params.device_id {
        count_query = count_query.bind(device_id);
    }
    if let Some(ref domain) = params.domain {
        count_query = count_query.bind(domain);
    }
    if let Some(ref query_type) = params.query_type {
        count_query = count_query.bind(query_type);
    }
    if let Some(blocked) = params.blocked {
        count_query = count_query.bind(blocked as i32);
    }
    let total = count_query.fetch_one(&state.db).await.map_err(|e| {
        tracing::error!("dns_query_log count failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // List query with LEFT JOIN to get device name.
    let list_sql = format!(
        "SELECT q.id, q.device_id, q.client_ip, q.domain, q.query_type, q.response_code, \
         q.blocked, q.response_time_ms, q.upstream, q.queried_at, \
         d.name AS device_name \
         FROM dns_query_log q \
         LEFT JOIN devices d ON q.device_id = d.id \
         WHERE {where_clause} \
         ORDER BY q.queried_at DESC \
         LIMIT ? OFFSET ?"
    );
    let mut list_query = sqlx::query_as::<_, DnsQueryRow>(&list_sql).bind(&interval);
    if let Some(ref device_id) = params.device_id {
        list_query = list_query.bind(device_id);
    }
    if let Some(ref domain) = params.domain {
        list_query = list_query.bind(domain);
    }
    if let Some(ref query_type) = params.query_type {
        list_query = list_query.bind(query_type);
    }
    if let Some(blocked) = params.blocked {
        list_query = list_query.bind(blocked as i32);
    }
    let rows = list_query
        .bind(per_page)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("dns_query_log list failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let items: Vec<DnsQueryEntry> = rows
        .into_iter()
        .map(|r| DnsQueryEntry {
            id: r.id,
            device_id: r.device_id,
            client_ip: r.client_ip,
            domain: r.domain,
            query_type: r.query_type,
            response_code: r.response_code,
            blocked: r.blocked != 0,
            response_time_ms: r.response_time_ms,
            upstream: r.upstream,
            queried_at: r.queried_at,
            device_name: r.device_name,
        })
        .collect();

    Ok(Json(DnsQueryLogResponse {
        items,
        total,
        page,
        per_page,
    }))
}

/// GET /api/v1/dns-queries/stats — aggregated DNS query statistics.
pub async fn stats(
    State(state): State<AppState>,
    Query(params): Query<DnsStatsQuery>,
) -> Result<Json<DnsQueryStats>, StatusCode> {
    let hours = params.hours.unwrap_or(24).clamp(1, 168);
    let interval = format!("-{hours} hours");

    // Total and blocked counts.
    let (total_queries, blocked_queries): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(blocked), 0) FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?)",
    )
    .bind(&interval)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("dns stats totals failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Unique domains.
    let unique_domains: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT domain) FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?)",
    )
    .bind(&interval)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("dns stats unique domains failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Unique clients.
    let unique_clients: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT client_ip) FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?)",
    )
    .bind(&interval)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("dns stats unique clients failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Top queried domains (top 10).
    let top_queried: Vec<(String, i64)> = sqlx::query_as(
        "SELECT domain, COUNT(*) AS cnt FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?) \
         GROUP BY domain ORDER BY cnt DESC LIMIT 10",
    )
    .bind(&interval)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Top blocked domains (top 10).
    let top_blocked: Vec<(String, i64)> = sqlx::query_as(
        "SELECT domain, COUNT(*) AS cnt FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?) AND blocked = 1 \
         GROUP BY domain ORDER BY cnt DESC LIMIT 10",
    )
    .bind(&interval)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Per-device stats.
    let device_rows: Vec<DeviceStatsRow> = sqlx::query_as(
        "SELECT q.device_id, q.client_ip, d.name, COUNT(*) AS total, \
         COALESCE(SUM(q.blocked), 0) AS blocked_cnt \
         FROM dns_query_log q \
         LEFT JOIN devices d ON q.device_id = d.id \
         WHERE q.queried_at >= datetime('now', ?) \
         GROUP BY q.client_ip \
         ORDER BY total DESC LIMIT 20",
    )
    .bind(&interval)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Queries over time (hourly buckets).
    let time_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT strftime('%Y-%m-%dT%H:00:00', queried_at) AS hour, \
         COUNT(*) AS total, COALESCE(SUM(blocked), 0) AS blocked_cnt \
         FROM dns_query_log \
         WHERE queried_at >= datetime('now', ?) \
         GROUP BY hour ORDER BY hour ASC",
    )
    .bind(&interval)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Ok(Json(DnsQueryStats {
        total_queries,
        blocked_queries,
        unique_domains,
        unique_clients,
        top_queried_domains: top_queried
            .into_iter()
            .map(|(domain, count)| DomainCount { domain, count })
            .collect(),
        top_blocked_domains: top_blocked
            .into_iter()
            .map(|(domain, count)| DomainCount { domain, count })
            .collect(),
        per_device_stats: device_rows
            .into_iter()
            .map(
                |(device_id, client_ip, device_name, total_queries, blocked_queries)| {
                    DeviceQueryStats {
                        device_id,
                        client_ip,
                        device_name,
                        total_queries,
                        blocked_queries,
                    }
                },
            )
            .collect(),
        queries_over_time: time_rows
            .into_iter()
            .map(|(time, total, blocked)| TimeSeriesPoint {
                time,
                total,
                blocked,
            })
            .collect(),
    }))
}

/// POST /api/v1/dns-queries/ingest — bulk-insert DNS query log entries.
pub async fn ingest(
    State(state): State<AppState>,
    Json(body): Json<IngestDnsRequest>,
) -> Result<Json<IngestDnsResponse>, StatusCode> {
    let mut inserted: u64 = 0;

    for q in &body.queries {
        let query_type = q.query_type.as_deref().unwrap_or("A");
        let response_code = q.response_code.as_deref().unwrap_or("NOERROR");
        let blocked = q.blocked.unwrap_or(false) as i32;

        // Try to find a device by matching client_ip to device_ips.
        let device_id: Option<String> = sqlx::query_scalar(
            "SELECT device_id FROM device_ips WHERE ip = ? ORDER BY seen_at DESC LIMIT 1",
        )
        .bind(&q.client_ip)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

        let result = if let Some(ref queried_at) = q.queried_at {
            sqlx::query(
                "INSERT INTO dns_query_log \
                 (device_id, client_ip, domain, query_type, response_code, blocked, response_time_ms, upstream, queried_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&device_id)
            .bind(&q.client_ip)
            .bind(&q.domain)
            .bind(query_type)
            .bind(response_code)
            .bind(blocked)
            .bind(q.response_time_ms)
            .bind(&q.upstream)
            .bind(queried_at)
            .execute(&state.db)
            .await
        } else {
            sqlx::query(
                "INSERT INTO dns_query_log \
                 (device_id, client_ip, domain, query_type, response_code, blocked, response_time_ms, upstream) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&device_id)
            .bind(&q.client_ip)
            .bind(&q.domain)
            .bind(query_type)
            .bind(response_code)
            .bind(blocked)
            .bind(q.response_time_ms)
            .bind(&q.upstream)
            .execute(&state.db)
            .await
        };

        match result {
            Ok(_) => inserted += 1,
            Err(e) => {
                tracing::error!("dns_query_log insert failed: {e}");
            }
        }
    }

    Ok(Json(IngestDnsResponse { inserted }))
}

/// Delete DNS query log entries older than the given number of days.
pub async fn delete_old_dns_queries(pool: &sqlx::SqlitePool, days: u64) -> u64 {
    let interval = format!("-{days} days");
    match sqlx::query("DELETE FROM dns_query_log WHERE queried_at < datetime('now', ?)")
        .bind(&interval)
        .execute(pool)
        .await
    {
        Ok(r) => r.rows_affected(),
        Err(e) => {
            tracing::error!("retention: failed to delete old dns_query_log: {e}");
            0
        }
    }
}
