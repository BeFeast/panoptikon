use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

// ─── Types ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DnsBlocklist {
    pub id: String,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub auto_refresh_hours: Option<i64>,
    pub domain_count: i64,
    pub last_updated_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBlocklistRequest {
    pub name: String,
    pub url: String,
    pub enabled: Option<bool>,
    pub auto_refresh_hours: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBlocklistRequest {
    pub name: Option<String>,
    pub url: Option<String>,
    pub enabled: Option<bool>,
    pub auto_refresh_hours: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct BlocklistStatsResponse {
    pub total_blocklists: i64,
    pub enabled_blocklists: i64,
    pub total_blocked_domains: i64,
    pub whitelist_count: i64,
    pub blacklist_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DnsDomainOverride {
    pub domain: String,
    pub action: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDomainOverrideRequest {
    pub domain: String,
    pub action: String,
}

#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub success: bool,
    pub message: String,
    pub domain_count: i64,
}

#[derive(Debug, Serialize)]
pub struct UnboundConfigResponse {
    pub config: String,
    pub domain_count: i64,
}

// ─── Row mapper helpers ─────────────────────────────────

fn row_to_blocklist(r: &sqlx::sqlite::SqliteRow) -> DnsBlocklist {
    DnsBlocklist {
        id: r.get("id"),
        name: r.get("name"),
        url: r.get("url"),
        enabled: r.get::<i32, _>("enabled") != 0,
        auto_refresh_hours: r.get("auto_refresh_hours"),
        domain_count: r.get("domain_count"),
        last_updated_at: r.get("last_updated_at"),
        created_at: r.get("created_at"),
    }
}

fn row_to_override(r: &sqlx::sqlite::SqliteRow) -> DnsDomainOverride {
    DnsDomainOverride {
        domain: r.get("domain"),
        action: r.get("action"),
        created_at: r.get("created_at"),
    }
}

// ─── Handlers ───────────────────────────────────────────

const SELECT_BLOCKLIST: &str = "SELECT id, name, url, enabled, auto_refresh_hours, \
                                 domain_count, last_updated_at, created_at \
                                 FROM dns_blocklists";

/// GET /dns-blocklists — list all blocklists.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<DnsBlocklist>>, StatusCode> {
    let rows: Vec<DnsBlocklist> =
        sqlx::query(&format!("{SELECT_BLOCKLIST} ORDER BY created_at DESC"))
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to list blocklists: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .iter()
            .map(row_to_blocklist)
            .collect();

    Ok(Json(rows))
}

/// POST /dns-blocklists — create a new blocklist.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateBlocklistRequest>,
) -> Result<(StatusCode, Json<DnsBlocklist>), (StatusCode, Json<serde_json::Value>)> {
    let name = body.name.trim().to_string();
    let url = body.url.trim().to_string();

    if name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Name is required"})),
        ));
    }
    if url.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "URL is required"})),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let enabled = body.enabled.unwrap_or(true);

    sqlx::query(
        "INSERT INTO dns_blocklists (id, name, url, enabled, auto_refresh_hours) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&url)
    .bind(enabled)
    .bind(body.auto_refresh_hours)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create blocklist: {e}");
        if e.to_string().contains("UNIQUE") {
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({"error": "A blocklist with this URL already exists"})),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to create blocklist"})),
            )
        }
    })?;

    let row = sqlx::query(&format!("{SELECT_BLOCKLIST} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch created blocklist: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to fetch created blocklist"})),
            )
        })?;

    Ok((StatusCode::CREATED, Json(row_to_blocklist(&row))))
}

/// PUT /dns-blocklists/:id — update a blocklist.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateBlocklistRequest>,
) -> Result<Json<DnsBlocklist>, (StatusCode, Json<serde_json::Value>)> {
    // Build dynamic update query.
    let mut sets = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref name) = body.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Name cannot be empty"})),
            ));
        }
        sets.push("name = ?");
        binds.push(name);
    }
    if let Some(ref url) = body.url {
        let url = url.trim().to_string();
        if url.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "URL cannot be empty"})),
            ));
        }
        sets.push("url = ?");
        binds.push(url);
    }
    if let Some(enabled) = body.enabled {
        sets.push("enabled = ?");
        binds.push(if enabled { "1".into() } else { "0".into() });
    }
    if body.auto_refresh_hours.is_some() {
        sets.push("auto_refresh_hours = ?");
        binds.push(
            body.auto_refresh_hours
                .map(|h| h.to_string())
                .unwrap_or_default(),
        );
    }

    if sets.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "No fields to update"})),
        ));
    }

    let sql = format!("UPDATE dns_blocklists SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    let result = query.execute(&state.db).await.map_err(|e| {
        tracing::error!("Failed to update blocklist: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Failed to update blocklist"})),
        )
    })?;

    if result.rows_affected() == 0 {
        return Err((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Blocklist not found"})),
        ));
    }

    let row = sqlx::query(&format!("{SELECT_BLOCKLIST} WHERE id = ?"))
        .bind(&id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch updated blocklist: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to fetch updated blocklist"})),
            )
        })?;

    Ok(Json(row_to_blocklist(&row)))
}

/// DELETE /dns-blocklists/:id — delete a blocklist and its domains.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM dns_blocklists WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete blocklist: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /dns-blocklists/:id/sync — download and parse the blocklist.
pub async fn sync_blocklist(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SyncResponse>, (StatusCode, Json<serde_json::Value>)> {
    // Fetch the blocklist record.
    let row = sqlx::query(&format!("{SELECT_BLOCKLIST} WHERE id = ?"))
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch blocklist: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Database error"})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Blocklist not found"})),
            )
        })?;

    let bl = row_to_blocklist(&row);

    // Download the blocklist.
    tracing::info!("Downloading blocklist '{}' from {}", bl.name, bl.url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| {
            tracing::error!("Failed to build HTTP client: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to build HTTP client"})),
            )
        })?;

    let resp = client.get(&bl.url).send().await.map_err(|e| {
        tracing::error!("Failed to download blocklist: {e}");
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": format!("Failed to download: {e}")})),
        )
    })?;

    if !resp.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(
                serde_json::json!({"error": format!("Download failed with status {}", resp.status())}),
            ),
        ));
    }

    let body_text = resp.text().await.map_err(|e| {
        tracing::error!("Failed to read blocklist body: {e}");
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": "Failed to read response body"})),
        )
    })?;

    // Parse domains from the blocklist (supports hosts-file and domain-list formats).
    let domains = parse_blocklist(&body_text);
    let domain_count = domains.len() as i64;

    tracing::info!(
        "Parsed {} domains from blocklist '{}'",
        domain_count,
        bl.name
    );

    // Replace old domains with new ones in a transaction.
    let mut tx = state.db.begin().await.map_err(|e| {
        tracing::error!("Failed to begin transaction: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Database error"})),
        )
    })?;

    sqlx::query("DELETE FROM dns_blocklist_domains WHERE blocklist_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("Failed to clear old domains: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Database error"})),
            )
        })?;

    // Insert in batches for performance.
    for chunk in domains.chunks(500) {
        let mut sql = String::from(
            "INSERT OR IGNORE INTO dns_blocklist_domains (domain, blocklist_id) VALUES ",
        );
        let mut first = true;
        for _ in chunk {
            if !first {
                sql.push(',');
            }
            sql.push_str("(?, ?)");
            first = false;
        }
        let mut query = sqlx::query(&sql);
        for domain in chunk {
            query = query.bind(domain).bind(&id);
        }
        query.execute(&mut *tx).await.map_err(|e| {
            tracing::error!("Failed to insert domains: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Database error"})),
            )
        })?;
    }

    // Update the blocklist metadata.
    sqlx::query(
        "UPDATE dns_blocklists SET domain_count = ?, last_updated_at = datetime('now') WHERE id = ?",
    )
    .bind(domain_count)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update blocklist metadata: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Database error"})),
        )
    })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Database error"})),
        )
    })?;

    Ok(Json(SyncResponse {
        success: true,
        message: format!("Downloaded {} domains from '{}'", domain_count, bl.name),
        domain_count,
    }))
}

/// GET /dns-blocklists/stats — blocklist statistics.
pub async fn stats(
    State(state): State<AppState>,
) -> Result<Json<BlocklistStatsResponse>, StatusCode> {
    let total_blocklists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dns_blocklists")
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let enabled_blocklists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_blocklists WHERE enabled = 1")
            .fetch_one(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_blocked_domains: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT domain) FROM dns_blocklist_domains d \
         JOIN dns_blocklists b ON d.blocklist_id = b.id WHERE b.enabled = 1",
    )
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let whitelist_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_domain_overrides WHERE action = 'whitelist'")
            .fetch_one(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let blacklist_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM dns_domain_overrides WHERE action = 'blacklist'")
            .fetch_one(&state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(BlocklistStatsResponse {
        total_blocklists,
        enabled_blocklists,
        total_blocked_domains,
        whitelist_count,
        blacklist_count,
    }))
}

/// GET /dns-blocklists/generate-config — generate Unbound local-zone config.
pub async fn generate_config(
    State(state): State<AppState>,
) -> Result<Json<UnboundConfigResponse>, StatusCode> {
    // Get all blocked domains from enabled blocklists.
    let blocked: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT d.domain FROM dns_blocklist_domains d \
         JOIN dns_blocklists b ON d.blocklist_id = b.id \
         WHERE b.enabled = 1 \
         ORDER BY d.domain",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch blocked domains: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Get whitelisted domains (these should be excluded).
    let whitelisted: Vec<(String,)> =
        sqlx::query_as("SELECT domain FROM dns_domain_overrides WHERE action = 'whitelist'")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch whitelisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    let whitelist_set: std::collections::HashSet<&str> =
        whitelisted.iter().map(|(d,)| d.as_str()).collect();

    // Get blacklisted domains (these should be added).
    let blacklisted: Vec<(String,)> =
        sqlx::query_as("SELECT domain FROM dns_domain_overrides WHERE action = 'blacklist'")
            .fetch_all(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch blacklisted domains: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

    // Build the Unbound config.
    let mut config = String::from("# Panoptikon DNS Blocklist — auto-generated\n");
    config.push_str("# Do not edit manually; changes will be overwritten.\n\n");

    let mut domain_count: i64 = 0;

    // Add blocked domains (excluding whitelisted).
    for (domain,) in &blocked {
        if whitelist_set.contains(domain.as_str()) {
            continue;
        }
        config.push_str(&format!("local-zone: \"{domain}\" always_nxdomain\n"));
        domain_count += 1;
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

/// GET /dns-blocklists/overrides — list domain overrides.
pub async fn list_overrides(
    State(state): State<AppState>,
) -> Result<Json<Vec<DnsDomainOverride>>, StatusCode> {
    let rows: Vec<DnsDomainOverride> = sqlx::query(
        "SELECT domain, action, created_at FROM dns_domain_overrides ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list overrides: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .iter()
    .map(row_to_override)
    .collect();

    Ok(Json(rows))
}

/// POST /dns-blocklists/overrides — create a domain override.
pub async fn create_override(
    State(state): State<AppState>,
    Json(body): Json<CreateDomainOverrideRequest>,
) -> Result<(StatusCode, Json<DnsDomainOverride>), (StatusCode, Json<serde_json::Value>)> {
    let domain = body.domain.trim().to_lowercase();
    let action = body.action.trim().to_lowercase();

    if domain.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Domain is required"})),
        ));
    }
    if action != "whitelist" && action != "blacklist" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Action must be 'whitelist' or 'blacklist'"})),
        ));
    }

    sqlx::query(
        "INSERT INTO dns_domain_overrides (domain, action) VALUES (?, ?) \
         ON CONFLICT(domain) DO UPDATE SET action = excluded.action",
    )
    .bind(&domain)
    .bind(&action)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create override: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Database error"})),
        )
    })?;

    let row =
        sqlx::query("SELECT domain, action, created_at FROM dns_domain_overrides WHERE domain = ?")
            .bind(&domain)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Failed to fetch created override: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": "Database error"})),
                )
            })?;

    Ok((StatusCode::CREATED, Json(row_to_override(&row))))
}

/// DELETE /dns-blocklists/overrides/:domain — delete a domain override.
pub async fn delete_override(
    State(state): State<AppState>,
    Path(domain): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let result = sqlx::query("DELETE FROM dns_domain_overrides WHERE domain = ?")
        .bind(&domain)
        .execute(&state.db)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete override: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}

// ─── Blocklist Parser ───────────────────────────────────

/// Parse a blocklist text into a list of domains.
/// Supports:
/// - Hosts file format: `0.0.0.0 domain.com` or `127.0.0.1 domain.com`
/// - Domain list format: one domain per line
/// - Adblock format: `||domain.com^`
fn parse_blocklist(text: &str) -> Vec<String> {
    let mut domains = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in text.lines() {
        let line = line.trim();

        // Skip empty lines and comments.
        if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
            continue;
        }

        let domain = if line.starts_with("||") && line.ends_with('^') {
            // Adblock format: ||domain.com^
            &line[2..line.len() - 1]
        } else if line.starts_with("0.0.0.0 ") || line.starts_with("127.0.0.1 ") {
            // Hosts file format
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                parts[1]
            } else {
                continue;
            }
        } else if line.contains(' ') || line.contains('\t') {
            // Other hosts format with IP prefix
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 && (parts[0].contains('.') || parts[0] == "::") {
                parts[1]
            } else {
                continue;
            }
        } else if line.contains('.') && !line.contains('/') && !line.contains(':') {
            // Plain domain
            line
        } else {
            continue;
        };

        let domain = domain.trim().to_lowercase();

        // Skip invalid or local domains.
        if domain.is_empty()
            || domain == "localhost"
            || domain == "localhost.localdomain"
            || domain == "broadcasthost"
            || domain == "local"
            || domain == "ip6-localhost"
            || domain == "ip6-loopback"
            || !domain.contains('.')
        {
            continue;
        }

        if seen.insert(domain.clone()) {
            domains.push(domain);
        }
    }

    domains
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hosts_format() {
        let input = "# Comment\n\
                      0.0.0.0 ads.example.com\n\
                      127.0.0.1 tracker.example.com\n\
                      0.0.0.0 localhost\n";
        let domains = parse_blocklist(input);
        assert_eq!(domains, vec!["ads.example.com", "tracker.example.com"]);
    }

    #[test]
    fn test_parse_domain_list_format() {
        let input = "# Blocklist\n\
                      ads.example.com\n\
                      tracker.example.com\n";
        let domains = parse_blocklist(input);
        assert_eq!(domains, vec!["ads.example.com", "tracker.example.com"]);
    }

    #[test]
    fn test_parse_adblock_format() {
        let input = "! Title: Test\n\
                      ||ads.example.com^\n\
                      ||tracker.example.com^\n";
        let domains = parse_blocklist(input);
        assert_eq!(domains, vec!["ads.example.com", "tracker.example.com"]);
    }

    #[test]
    fn test_parse_deduplication() {
        let input = "0.0.0.0 ads.example.com\n\
                      0.0.0.0 ads.example.com\n\
                      ads.example.com\n";
        let domains = parse_blocklist(input);
        assert_eq!(domains, vec!["ads.example.com"]);
    }
}
