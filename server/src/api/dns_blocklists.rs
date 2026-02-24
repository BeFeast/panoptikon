use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

use super::AppState;

// ─── DTOs ──────────────────────────────────────────────────

/// A DNS blocklist source as returned to the frontend.
#[derive(Debug, Serialize)]
pub struct DnsBlocklist {
    pub id: String,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub format: String,
    pub domain_count: i64,
    pub last_downloaded_at: Option<String>,
    pub last_error: Option<String>,
    pub refresh_interval_hours: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating/updating a blocklist.
#[derive(Debug, Deserialize)]
pub struct DnsBlocklistRequest {
    pub name: String,
    pub url: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_format")]
    pub format: String,
    #[serde(default = "default_refresh")]
    pub refresh_interval_hours: i64,
}

fn default_true() -> bool {
    true
}

fn default_format() -> String {
    "hosts".to_string()
}

fn default_refresh() -> i64 {
    24
}

/// A per-domain whitelist/blacklist override.
#[derive(Debug, Serialize)]
pub struct DnsDomainOverride {
    pub id: String,
    pub domain: String,
    pub action: String,
    pub created_at: String,
}

/// Request body for creating a domain override.
#[derive(Debug, Deserialize)]
pub struct DnsDomainOverrideRequest {
    pub domain: String,
    pub action: String,
}

/// Stats response for the blocklist dashboard.
#[derive(Debug, Serialize)]
pub struct BlocklistStats {
    pub total_blocklists: i64,
    pub enabled_blocklists: i64,
    pub total_blocked_domains: i64,
    pub whitelist_count: i64,
    pub blacklist_count: i64,
    pub last_updated: Option<String>,
}

/// Response for download/refresh operations.
#[derive(Debug, Serialize)]
pub struct DownloadResponse {
    pub success: bool,
    pub message: String,
    pub domain_count: i64,
}

/// Generated Unbound config snippet.
#[derive(Debug, Serialize)]
pub struct UnboundConfigResponse {
    pub config: String,
    pub domain_count: i64,
}

// ─── Handlers: Blocklists CRUD ─────────────────────────────

/// GET /api/v1/dns-blocklists — list all blocklist sources.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<DnsBlocklist>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, name, url, enabled, format, domain_count, \
         last_downloaded_at, last_error, refresh_interval_hours, \
         created_at, updated_at \
         FROM dns_blocklists ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list DNS blocklists: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let lists: Vec<DnsBlocklist> = rows
        .into_iter()
        .map(|r| DnsBlocklist {
            id: r.get("id"),
            name: r.get("name"),
            url: r.get("url"),
            enabled: r.get::<i32, _>("enabled") != 0,
            format: r.get("format"),
            domain_count: r.get("domain_count"),
            last_downloaded_at: r.get("last_downloaded_at"),
            last_error: r.get("last_error"),
            refresh_interval_hours: r.get("refresh_interval_hours"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(lists))
}

/// POST /api/v1/dns-blocklists — create a new blocklist.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<DnsBlocklistRequest>,
) -> Result<(StatusCode, Json<DnsBlocklist>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO dns_blocklists (id, name, url, enabled, format, refresh_interval_hours) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.url)
    .bind(body.enabled as i32)
    .bind(&body.format)
    .bind(body.refresh_interval_hours)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create DNS blocklist: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let bl = fetch_blocklist_by_id(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(bl)))
}

/// PUT /api/v1/dns-blocklists/:id — update a blocklist.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<DnsBlocklistRequest>,
) -> Result<Json<DnsBlocklist>, StatusCode> {
    let affected = sqlx::query(
        "UPDATE dns_blocklists \
         SET name = ?, url = ?, enabled = ?, format = ?, \
             refresh_interval_hours = ?, updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.url)
    .bind(body.enabled as i32)
    .bind(&body.format)
    .bind(body.refresh_interval_hours)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update DNS blocklist: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let bl = fetch_blocklist_by_id(&state, &id).await?;
    Ok(Json(bl))
}

/// DELETE /api/v1/dns-blocklists/:id — delete a blocklist and its cached domains.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let affected = sqlx::query("DELETE FROM dns_blocklists WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete DNS blocklist: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/dns-blocklists/:id/toggle — enable/disable a blocklist.
pub async fn toggle(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<DnsBlocklist>, StatusCode> {
    let affected = sqlx::query(
        "UPDATE dns_blocklists SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle DNS blocklist: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    let bl = fetch_blocklist_by_id(&state, &id).await?;
    Ok(Json(bl))
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// POST /api/v1/dns-blocklists/:id/download — download and parse a blocklist.
pub async fn download(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DownloadResponse>, StatusCode> {
    let row = sqlx::query("SELECT url, format FROM dns_blocklists WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to fetch blocklist for download: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .ok_or(StatusCode::NOT_FOUND)?;

    let url: String = row.get("url");
    let format: String = row.get("format");

    // Download the blocklist.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| {
            error!("Failed to build HTTP client: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let body_text = match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
        Ok(resp) => {
            let status = resp.status();
            let msg = format!("HTTP {status} fetching {url}");
            warn!("{msg}");
            set_blocklist_error(&state, &id, &msg).await;
            return Ok(Json(DownloadResponse {
                success: false,
                message: msg,
                domain_count: 0,
            }));
        }
        Err(e) => {
            let msg = format!("Failed to fetch {url}: {e}");
            warn!("{msg}");
            set_blocklist_error(&state, &id, &msg).await;
            return Ok(Json(DownloadResponse {
                success: false,
                message: msg,
                domain_count: 0,
            }));
        }
    };

    // Parse domains from the downloaded content.
    let domains = parse_blocklist(&body_text, &format);
    let domain_count = domains.len() as i64;

    // Replace cached domains in a transaction.
    let mut tx = state.db.begin().await.map_err(|e| {
        error!("Failed to begin transaction: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    sqlx::query("DELETE FROM dns_blocked_domains WHERE blocklist_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            error!("Failed to clear old domains: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Insert domains in batches.
    for chunk in domains.chunks(500) {
        let mut sql = String::from(
            "INSERT OR IGNORE INTO dns_blocked_domains (domain, blocklist_id) VALUES ",
        );
        let mut first = true;
        for _ in chunk {
            if !first {
                sql.push_str(", ");
            }
            sql.push_str("(?, ?)");
            first = false;
        }

        let mut query = sqlx::query(&sql);
        for domain in chunk {
            query = query.bind(domain).bind(&id);
        }
        query.execute(&mut *tx).await.map_err(|e| {
            error!("Failed to insert blocked domains: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    // Update blocklist metadata.
    sqlx::query(
        "UPDATE dns_blocklists \
         SET domain_count = ?, last_downloaded_at = datetime('now'), \
             last_error = NULL, updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(domain_count)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Failed to update blocklist metadata: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    tx.commit().await.map_err(|e| {
        error!("Failed to commit transaction: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    info!("Downloaded blocklist {id}: {domain_count} domains from {url}");

    Ok(Json(DownloadResponse {
        success: true,
        message: format!("Downloaded {domain_count} domains"),
        domain_count,
    }))
}

// ─── Handlers: Domain Overrides ─────────────────────────────

/// GET /api/v1/dns-blocklists/overrides — list all domain overrides.
pub async fn list_overrides(
    State(state): State<AppState>,
) -> Result<Json<Vec<DnsDomainOverride>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, domain, action, created_at \
         FROM dns_domain_overrides ORDER BY domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list domain overrides: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let overrides: Vec<DnsDomainOverride> = rows
        .into_iter()
        .map(|r| DnsDomainOverride {
            id: r.get("id"),
            domain: r.get("domain"),
            action: r.get("action"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(Json(overrides))
}

/// POST /api/v1/dns-blocklists/overrides — create a domain override.
pub async fn create_override(
    State(state): State<AppState>,
    Json(body): Json<DnsDomainOverrideRequest>,
) -> Result<(StatusCode, Json<DnsDomainOverride>), StatusCode> {
    if body.action != "whitelist" && body.action != "blacklist" {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let domain = body.domain.trim().to_lowercase();

    sqlx::query(
        "INSERT INTO dns_domain_overrides (id, domain, action) VALUES (?, ?, ?) \
         ON CONFLICT(domain) DO UPDATE SET action = excluded.action",
    )
    .bind(&id)
    .bind(&domain)
    .bind(&body.action)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create domain override: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Fetch the actual inserted/updated row.
    let row = sqlx::query(
        "SELECT id, domain, action, created_at FROM dns_domain_overrides WHERE domain = ?",
    )
    .bind(&domain)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch domain override: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let ovr = DnsDomainOverride {
        id: row.get("id"),
        domain: row.get("domain"),
        action: row.get("action"),
        created_at: row.get("created_at"),
    };

    Ok((StatusCode::CREATED, Json(ovr)))
}

/// DELETE /api/v1/dns-blocklists/overrides/:id — delete a domain override.
pub async fn delete_override(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let affected = sqlx::query("DELETE FROM dns_domain_overrides WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete domain override: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

// ─── Handlers: Stats & Config ───────────────────────────────

/// GET /api/v1/dns-blocklists/stats — blocklist dashboard stats.
pub async fn stats(State(state): State<AppState>) -> Result<Json<BlocklistStats>, StatusCode> {
    let total_blocklists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dns_blocklists")
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to count blocklists: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let enabled_blocklists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_blocklists WHERE enabled = 1")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to count enabled blocklists: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let total_blocked_domains: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT domain) FROM dns_blocked_domains \
         WHERE blocklist_id IN (SELECT id FROM dns_blocklists WHERE enabled = 1)",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to count blocked domains: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let whitelist_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_domain_overrides WHERE action = 'whitelist'")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to count whitelisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let blacklist_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_domain_overrides WHERE action = 'blacklist'")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to count blacklisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let last_updated: Option<String> =
        sqlx::query_scalar("SELECT MAX(last_downloaded_at) FROM dns_blocklists WHERE enabled = 1")
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to get last updated: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    Ok(Json(BlocklistStats {
        total_blocklists,
        enabled_blocklists,
        total_blocked_domains,
        whitelist_count,
        blacklist_count,
        last_updated,
    }))
}

/// GET /api/v1/dns-blocklists/unbound-config — generate Unbound local-zone config.
pub async fn unbound_config(
    State(state): State<AppState>,
) -> Result<Json<UnboundConfigResponse>, StatusCode> {
    // Get all unique blocked domains from enabled blocklists.
    let blocked: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT d.domain FROM dns_blocked_domains d \
         INNER JOIN dns_blocklists bl ON d.blocklist_id = bl.id \
         WHERE bl.enabled = 1 \
         ORDER BY d.domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch blocked domains: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Get whitelisted domains (to exclude).
    let whitelisted: Vec<(String,)> =
        sqlx::query_as("SELECT domain FROM dns_domain_overrides WHERE action = 'whitelist'")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to fetch whitelisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let whitelist_set: std::collections::HashSet<String> =
        whitelisted.into_iter().map(|(d,)| d).collect();

    // Get blacklisted domains (to add).
    let blacklisted: Vec<(String,)> =
        sqlx::query_as("SELECT domain FROM dns_domain_overrides WHERE action = 'blacklist'")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to fetch blacklisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    // Build Unbound local-zone config.
    let mut config = String::from("# DNS Blocklist — generated by Panoptikon\n");
    config.push_str("# Do not edit manually; this file is regenerated on update.\n\n");

    let mut domain_count: i64 = 0;

    // Add blocked domains (minus whitelisted).
    for (domain,) in &blocked {
        if !whitelist_set.contains(domain) {
            config.push_str(&format!("local-zone: \"{domain}\" always_nxdomain\n"));
            domain_count += 1;
        }
    }

    // Add manually blacklisted domains.
    for (domain,) in &blacklisted {
        config.push_str(&format!("local-zone: \"{domain}\" always_nxdomain\n"));
        domain_count += 1;
    }

    Ok(Json(UnboundConfigResponse {
        config,
        domain_count,
    }))
}

// ─── Helpers ────────────────────────────────────────────────

/// Parse a blocklist body into a list of domain names.
fn parse_blocklist(body: &str, format: &str) -> Vec<String> {
    let mut domains = Vec::new();

    for line in body.lines() {
        let line = line.trim();

        // Skip empty lines and comments.
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }

        let domain = match format {
            "hosts" => {
                // Hosts file format: "0.0.0.0 domain.com" or "127.0.0.1 domain.com"
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2
                    && (parts[0] == "0.0.0.0"
                        || parts[0] == "127.0.0.1"
                        || parts[0] == "::1"
                        || parts[0] == "::0"
                        || parts[0] == "::")
                {
                    Some(parts[1].to_lowercase())
                } else if parts.len() == 1 {
                    // Plain domain format (one domain per line).
                    Some(parts[0].to_lowercase())
                } else {
                    None
                }
            }
            "domains" => {
                // One domain per line.
                Some(line.to_lowercase())
            }
            _ => {
                // Default: try hosts format.
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 && (parts[0] == "0.0.0.0" || parts[0] == "127.0.0.1") {
                    Some(parts[1].to_lowercase())
                } else if parts.len() == 1 {
                    Some(parts[0].to_lowercase())
                } else {
                    None
                }
            }
        };

        if let Some(d) = domain {
            // Basic validation: must contain a dot, no spaces.
            if d.contains('.') && !d.contains(' ') && d != "localhost" && d.len() < 256 {
                domains.push(d);
            }
        }
    }

    domains
}

/// Record an error for a blocklist.
async fn set_blocklist_error(state: &AppState, id: &str, error_msg: &str) {
    let _ = sqlx::query(
        "UPDATE dns_blocklists SET last_error = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(error_msg)
    .bind(id)
    .execute(&state.db)
    .await;
}

/// Fetch a single blocklist by ID.
async fn fetch_blocklist_by_id(state: &AppState, id: &str) -> Result<DnsBlocklist, StatusCode> {
    let row = sqlx::query(
        "SELECT id, name, url, enabled, format, domain_count, \
         last_downloaded_at, last_error, refresh_interval_hours, \
         created_at, updated_at \
         FROM dns_blocklists WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch DNS blocklist: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(DnsBlocklist {
        id: row.get("id"),
        name: row.get("name"),
        url: row.get("url"),
        enabled: row.get::<i32, _>("enabled") != 0,
        format: row.get("format"),
        domain_count: row.get("domain_count"),
        last_downloaded_at: row.get("last_downloaded_at"),
        last_error: row.get("last_error"),
        refresh_interval_hours: row.get("refresh_interval_hours"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}
