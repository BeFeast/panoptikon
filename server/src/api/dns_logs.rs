use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;

// ─── Response types ──────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DnsQueryLogEntry {
    pub id: i64,
    pub device_id: Option<String>,
    pub client_ip: String,
    pub domain: String,
    pub query_type: String,
    pub result: String,
    pub blocked: bool,
    pub response_time_ms: Option<i64>,
    pub queried_at: String,
    /// Device name (joined from devices table).
    pub device_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DnsQueryLogResponse {
    pub entries: Vec<DnsQueryLogEntry>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct DnsTopDomain {
    pub domain: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct DnsDeviceStats {
    pub device_id: Option<String>,
    pub client_ip: String,
    pub device_name: Option<String>,
    pub total_queries: i64,
    pub blocked_queries: i64,
    pub unique_domains: i64,
}

#[derive(Debug, Serialize)]
pub struct DnsStatsResponse {
    pub total_queries: i64,
    pub total_blocked: i64,
    pub unique_domains: i64,
    pub unique_clients: i64,
    pub top_queried: Vec<DnsTopDomain>,
    pub top_blocked: Vec<DnsTopDomain>,
    pub device_stats: Vec<DnsDeviceStats>,
}

// ─── Request types ───────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct DnsLogQueryParams {
    pub device_id: Option<String>,
    pub domain: Option<String>,
    pub client_ip: Option<String>,
    pub blocked: Option<bool>,
    pub since: Option<String>,
    pub until: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DnsStatsQueryParams {
    pub since: Option<String>,
    pub until: Option<String>,
    pub device_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DnsLogIngestRequest {
    pub client_ip: String,
    pub domain: String,
    pub query_type: Option<String>,
    pub result: Option<String>,
    pub blocked: Option<bool>,
    pub response_time_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DnsLogBulkIngestRequest {
    pub entries: Vec<DnsLogIngestRequest>,
}

// ─── Handlers ────────────────────────────────────────────

/// GET /api/v1/dns-logs — list DNS query log entries with optional filters.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<DnsLogQueryParams>,
) -> Result<Json<DnsQueryLogResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(100).min(1000);
    let offset = params.offset.unwrap_or(0);

    // Build dynamic WHERE clause.
    let mut conditions = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(ref device_id) = params.device_id {
        conditions.push(format!("q.device_id = ${}", bind_values.len() + 1));
        bind_values.push(device_id.clone());
    }
    if let Some(ref domain) = params.domain {
        conditions.push(format!("q.domain LIKE ${}", bind_values.len() + 1));
        bind_values.push(format!("%{domain}%"));
    }
    if let Some(ref client_ip) = params.client_ip {
        conditions.push(format!("q.client_ip = ${}", bind_values.len() + 1));
        bind_values.push(client_ip.clone());
    }
    if let Some(blocked) = params.blocked {
        conditions.push(format!("q.blocked = ${}", bind_values.len() + 1));
        bind_values.push(if blocked { "1".into() } else { "0".into() });
    }
    if let Some(ref since) = params.since {
        conditions.push(format!("q.queried_at >= ${}", bind_values.len() + 1));
        bind_values.push(since.clone());
    }
    if let Some(ref until) = params.until {
        conditions.push(format!("q.queried_at <= ${}", bind_values.len() + 1));
        bind_values.push(until.clone());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Count query.
    let count_sql = format!("SELECT COUNT(*) as cnt FROM dns_query_log q {where_clause}");
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);
    for v in &bind_values {
        count_query = count_query.bind(v);
    }
    let total = count_query.fetch_one(&state.db).await.unwrap_or(0);

    // Entries query with device name join.
    let entries_sql = format!(
        "SELECT q.id, q.device_id, q.client_ip, q.domain, q.query_type, \
         q.response_code, q.blocked, q.response_time_ms, q.queried_at, \
         COALESCE(d.custom_name, d.name, d.hostname) as device_name \
         FROM dns_query_log q \
         LEFT JOIN devices d ON d.id = q.device_id \
         {where_clause} \
         ORDER BY q.queried_at DESC \
         LIMIT {limit} OFFSET {offset}"
    );

    let mut entries_query = sqlx::query_as::<_, DnsQueryLogRow>(&entries_sql);
    for v in &bind_values {
        entries_query = entries_query.bind(v);
    }

    let rows = match entries_query.fetch_all(&state.db).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("DNS log list query failed: {e}");
            return Ok(Json(DnsQueryLogResponse {
                entries: vec![],
                total: 0,
            }));
        }
    };

    let entries = rows
        .into_iter()
        .map(|r| DnsQueryLogEntry {
            id: r.id,
            device_id: r.device_id,
            client_ip: r.client_ip,
            domain: r.domain,
            query_type: r.query_type,
            result: r.response_code,
            blocked: r.blocked != 0,
            response_time_ms: r.response_time_ms,
            queried_at: r.queried_at,
            device_name: r.device_name,
        })
        .collect();

    Ok(Json(DnsQueryLogResponse { entries, total }))
}

/// GET /api/v1/dns-logs/stats — aggregate DNS query statistics.
pub async fn stats(
    State(state): State<AppState>,
    Query(params): Query<DnsStatsQueryParams>,
) -> Result<Json<DnsStatsResponse>, StatusCode> {
    let mut conditions = Vec::new();
    let mut bind_values: Vec<String> = Vec::new();

    if let Some(ref since) = params.since {
        conditions.push(format!("q.queried_at >= ${}", bind_values.len() + 1));
        bind_values.push(since.clone());
    }
    if let Some(ref until) = params.until {
        conditions.push(format!("q.queried_at <= ${}", bind_values.len() + 1));
        bind_values.push(until.clone());
    }
    if let Some(ref device_id) = params.device_id {
        conditions.push(format!("q.device_id = ${}", bind_values.len() + 1));
        bind_values.push(device_id.clone());
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Summary stats.
    let summary_sql = format!(
        "SELECT \
         COUNT(*) as total_queries, \
         SUM(CASE WHEN q.blocked = 1 THEN 1 ELSE 0 END) as total_blocked, \
         COUNT(DISTINCT q.domain) as unique_domains, \
         COUNT(DISTINCT q.client_ip) as unique_clients \
         FROM dns_query_log q {where_clause}"
    );
    let mut summary_query = sqlx::query_as::<_, DnsSummaryRow>(&summary_sql);
    for v in &bind_values {
        summary_query = summary_query.bind(v);
    }
    let summary = summary_query.fetch_one(&state.db).await.map_err(|e| {
        tracing::error!("DNS stats summary query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Top queried domains.
    let top_queried_sql = format!(
        "SELECT q.domain, COUNT(*) as cnt \
         FROM dns_query_log q {where_clause} \
         GROUP BY q.domain ORDER BY cnt DESC LIMIT 10"
    );
    let mut tq_query = sqlx::query_as::<_, DnsTopDomainRow>(&top_queried_sql);
    for v in &bind_values {
        tq_query = tq_query.bind(v);
    }
    let top_queried: Vec<DnsTopDomain> = tq_query
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|r| DnsTopDomain {
            domain: r.domain,
            count: r.cnt,
        })
        .collect();

    // Top blocked domains.
    let blocked_where = if conditions.is_empty() {
        "WHERE q.blocked = 1".to_string()
    } else {
        format!("{where_clause} AND q.blocked = 1")
    };
    let top_blocked_sql = format!(
        "SELECT q.domain, COUNT(*) as cnt \
         FROM dns_query_log q {blocked_where} \
         GROUP BY q.domain ORDER BY cnt DESC LIMIT 10"
    );
    let mut tb_query = sqlx::query_as::<_, DnsTopDomainRow>(&top_blocked_sql);
    for v in &bind_values {
        tb_query = tb_query.bind(v);
    }
    let top_blocked: Vec<DnsTopDomain> = tb_query
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|r| DnsTopDomain {
            domain: r.domain,
            count: r.cnt,
        })
        .collect();

    // Per-device stats.
    let device_stats_sql = format!(
        "SELECT q.device_id, q.client_ip, \
         COALESCE(d.custom_name, d.name, d.hostname) as device_name, \
         COUNT(*) as total_queries, \
         SUM(CASE WHEN q.blocked = 1 THEN 1 ELSE 0 END) as blocked_queries, \
         COUNT(DISTINCT q.domain) as unique_domains \
         FROM dns_query_log q \
         LEFT JOIN devices d ON d.id = q.device_id \
         {where_clause} \
         GROUP BY q.client_ip \
         ORDER BY total_queries DESC \
         LIMIT 50"
    );
    let mut ds_query = sqlx::query_as::<_, DnsDeviceStatsRow>(&device_stats_sql);
    for v in &bind_values {
        ds_query = ds_query.bind(v);
    }
    let device_stats: Vec<DnsDeviceStats> = ds_query
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|r| DnsDeviceStats {
            device_id: r.device_id,
            client_ip: r.client_ip,
            device_name: r.device_name,
            total_queries: r.total_queries,
            blocked_queries: r.blocked_queries.unwrap_or(0),
            unique_domains: r.unique_domains,
        })
        .collect();

    Ok(Json(DnsStatsResponse {
        total_queries: summary.total_queries,
        total_blocked: summary.total_blocked.unwrap_or(0),
        unique_domains: summary.unique_domains,
        unique_clients: summary.unique_clients,
        top_queried,
        top_blocked,
        device_stats,
    }))
}

/// POST /api/v1/dns-logs/ingest — ingest DNS query log entries.
/// Used by external scripts that parse Unbound logs or dnstap output.
pub async fn ingest(
    State(state): State<AppState>,
    Json(body): Json<DnsLogBulkIngestRequest>,
) -> Result<Json<IngestResponse>, (StatusCode, String)> {
    let mut inserted = 0i64;

    for entry in &body.entries {
        // Try to resolve device_id from client_ip.
        let device_id: Option<String> = sqlx::query_scalar(
            "SELECT d.id FROM devices d \
             JOIN device_ips di ON di.device_id = d.id \
             WHERE di.ip = ? AND di.is_current = 1 \
             LIMIT 1",
        )
        .bind(&entry.client_ip)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        let query_type = entry.query_type.as_deref().unwrap_or("A");
        let result = entry.result.as_deref().unwrap_or("NOERROR");
        let blocked = entry.blocked.unwrap_or(false);

        let res = sqlx::query(
            "INSERT INTO dns_query_log \
             (device_id, client_ip, domain, query_type, response_code, blocked, response_time_ms) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&device_id)
        .bind(&entry.client_ip)
        .bind(&entry.domain)
        .bind(query_type)
        .bind(result)
        .bind(blocked)
        .bind(entry.response_time_ms)
        .execute(&state.db)
        .await;

        if res.is_ok() {
            inserted += 1;
        }
    }

    Ok(Json(IngestResponse {
        inserted,
        total: body.entries.len() as i64,
    }))
}

/// DELETE /api/v1/dns-logs — purge all DNS query logs.
pub async fn purge(State(state): State<AppState>) -> Result<Json<PurgeResponse>, StatusCode> {
    let result = sqlx::query("DELETE FROM dns_query_log")
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("DNS log purge failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(PurgeResponse {
        deleted: result.rows_affected() as i64,
    }))
}

#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub inserted: i64,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct PurgeResponse {
    pub deleted: i64,
}

// ─── Internal row types (sqlx::FromRow) ──────────────────

#[derive(Debug, sqlx::FromRow)]
struct DnsQueryLogRow {
    id: i64,
    device_id: Option<String>,
    client_ip: String,
    domain: String,
    query_type: String,
    response_code: String,
    blocked: i64,
    response_time_ms: Option<i64>,
    queried_at: String,
    device_name: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct DnsSummaryRow {
    total_queries: i64,
    total_blocked: Option<i64>,
    unique_domains: i64,
    unique_clients: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct DnsTopDomainRow {
    domain: String,
    cnt: i64,
}

#[derive(Debug, sqlx::FromRow)]
struct DnsDeviceStatsRow {
    device_id: Option<String>,
    client_ip: String,
    device_name: Option<String>,
    total_queries: i64,
    blocked_queries: Option<i64>,
    unique_domains: i64,
}
