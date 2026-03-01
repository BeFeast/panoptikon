use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

use super::{AppError, AppState};

// ─── Types ───────────────────────────────────────────────

/// Valid asset_type values.
const VALID_ASSET_TYPES: &[&str] = &[
    "server",
    "workstation",
    "vm",
    "container",
    "nas",
    "router",
    "switch",
    "iot",
    "phone",
    "printer",
    "unknown",
];

/// Valid asset status values.
const VALID_STATUSES: &[&str] = &["active", "inactive", "maintenance", "retired", "disposed"];

/// An asset as returned by the API.
#[derive(Debug, Serialize)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub asset_type: String,
    pub status: String,
    pub location: Option<String>,
    pub owner: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub purchase_date: Option<String>,
    pub serial_number: Option<String>,
    pub device_id: Option<String>,
    pub agent_id: Option<String>,
    pub ssh_target_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // Merged from linked device (if any):
    pub ip: Option<String>,
    pub mac: Option<String>,
    pub device_online: Option<bool>,
    pub device_last_seen: Option<String>,
    // Merged from linked agent (if any):
    pub agent_name: Option<String>,
    pub agent_os: Option<String>,
    pub agent_online: Option<bool>,
    // Merged from linked SSH target (if any):
    pub ssh_name: Option<String>,
    pub ssh_os: Option<String>,
    pub ssh_online: Option<bool>,
}

/// Request body for creating / updating an asset.
#[derive(Debug, Deserialize)]
pub struct AssetRequest {
    pub name: Option<String>,
    pub asset_type: Option<String>,
    pub status: Option<String>,
    pub location: Option<String>,
    pub owner: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub purchase_date: Option<String>,
    pub serial_number: Option<String>,
    pub device_id: Option<String>,
    pub agent_id: Option<String>,
    pub ssh_target_id: Option<String>,
}

/// Query parameters for listing assets.
#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(rename = "type")]
    pub asset_type: Option<String>,
    pub tag: Option<String>,
    pub status: Option<String>,
    pub location: Option<String>,
}

/// A single row in a CSV import.
#[derive(Debug, Deserialize)]
pub struct CsvImportRow {
    pub name: String,
    pub asset_type: Option<String>,
    pub status: Option<String>,
    pub location: Option<String>,
    pub owner: Option<String>,
    pub tags: Option<String>,
    pub notes: Option<String>,
    pub purchase_date: Option<String>,
    pub serial_number: Option<String>,
}

/// Request body for bulk CSV import.
#[derive(Debug, Deserialize)]
pub struct ImportRequest {
    pub rows: Vec<CsvImportRow>,
}

/// Response for bulk import.
#[derive(Debug, Serialize)]
pub struct ImportResponse {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Response for auto-link operation.
#[derive(Debug, Serialize)]
pub struct AutoLinkResponse {
    pub linked: usize,
    pub details: Vec<String>,
}

// ─── Helpers ─────────────────────────────────────────────

fn asset_from_row(row: sqlx::sqlite::SqliteRow) -> Result<Asset, sqlx::Error> {
    // Compute agent online status from last_report_at
    let agent_last_report: Option<String> = row.try_get("agent_last_report").ok().flatten();
    let agent_online = agent_last_report.as_ref().map(|ts| {
        chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S")
            .map(|last| {
                let elapsed = (chrono::Utc::now().naive_utc() - last).num_seconds();
                elapsed < 120
            })
            .unwrap_or(false)
    });

    // Compute SSH target online status
    let ssh_last_report: Option<String> = row.try_get("ssh_last_report").ok().flatten();
    let ssh_poll_interval: Option<i32> = row.try_get("ssh_poll_interval").ok().flatten();
    let ssh_online = ssh_last_report.as_ref().map(|ts| {
        let interval = ssh_poll_interval.unwrap_or(60) as i64;
        chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S")
            .map(|last| {
                let elapsed = (chrono::Utc::now().naive_utc() - last).num_seconds();
                elapsed < interval * 3
            })
            .unwrap_or(false)
    });

    let agent_os_name: Option<String> = row.try_get("agent_os_name").ok().flatten();
    let agent_os_version: Option<String> = row.try_get("agent_os_version").ok().flatten();
    let agent_os = agent_os_name.map(|name| {
        if let Some(ver) = agent_os_version {
            format!("{name} {ver}")
        } else {
            name
        }
    });

    let ssh_os_name: Option<String> = row.try_get("ssh_os_name").ok().flatten();
    let ssh_os_version: Option<String> = row.try_get("ssh_os_version").ok().flatten();
    let ssh_os = ssh_os_name.map(|name| {
        if let Some(ver) = ssh_os_version {
            format!("{name} {ver}")
        } else {
            name
        }
    });

    Ok(Asset {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        asset_type: row.try_get("asset_type")?,
        status: row
            .try_get("status")
            .unwrap_or_else(|_| "active".to_string()),
        location: row.try_get("location").ok().flatten(),
        owner: row.try_get("owner").ok().flatten(),
        tags: row.try_get("tags").ok().flatten(),
        notes: row.try_get("notes").ok().flatten(),
        purchase_date: row.try_get("purchase_date").ok().flatten(),
        serial_number: row.try_get("serial_number").ok().flatten(),
        device_id: row.try_get("device_id").ok().flatten(),
        agent_id: row.try_get("agent_id").ok().flatten(),
        ssh_target_id: row.try_get("ssh_target_id").ok().flatten(),
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        // Linked device data
        ip: row.try_get("device_ip").ok().flatten(),
        mac: row.try_get("device_mac").ok().flatten(),
        device_online: row
            .try_get::<Option<i32>, _>("device_online")
            .ok()
            .flatten()
            .map(|v| v != 0),
        device_last_seen: row.try_get("device_last_seen").ok().flatten(),
        // Linked agent data
        agent_name: row.try_get("agent_name").ok().flatten(),
        agent_os,
        agent_online,
        // Linked SSH target data
        ssh_name: row.try_get("ssh_name").ok().flatten(),
        ssh_os,
        ssh_online,
    })
}

fn non_empty_trimmed(value: Option<String>) -> Option<String> {
    value.and_then(|v| {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

const LIST_QUERY: &str = "\
    SELECT a.id, a.name, a.asset_type, a.status, a.location, a.owner, a.tags, a.notes, \
           a.purchase_date, a.serial_number, a.device_id, a.agent_id, a.ssh_target_id, \
           a.created_at, a.updated_at, \
           d.is_online AS device_online, d.last_seen_at AS device_last_seen, \
           d.mac AS device_mac, \
           (SELECT di.ip FROM device_ips di WHERE di.device_id = d.id ORDER BY di.seen_at DESC LIMIT 1) AS device_ip, \
           ag.name AS agent_name, ar.os_name AS agent_os_name, ar.os_version AS agent_os_version, \
           ar.reported_at AS agent_last_report, \
           st.name AS ssh_name, sr.os_name AS ssh_os_name, sr.os_version AS ssh_os_version, \
           sr.reported_at AS ssh_last_report, st.poll_interval_secs AS ssh_poll_interval \
    FROM assets a \
    LEFT JOIN devices d ON d.id = a.device_id \
    LEFT JOIN agents ag ON ag.id = a.agent_id \
    LEFT JOIN agent_reports ar ON ar.agent_id = ag.id \
      AND ar.id = (SELECT ar2.id FROM agent_reports ar2 WHERE ar2.agent_id = ag.id ORDER BY ar2.reported_at DESC LIMIT 1) \
    LEFT JOIN ssh_targets st ON st.id = a.ssh_target_id \
    LEFT JOIN ssh_reports sr ON sr.target_id = st.id \
      AND sr.id = (SELECT sr2.id FROM ssh_reports sr2 WHERE sr2.target_id = st.id ORDER BY sr2.reported_at DESC LIMIT 1) \
    ORDER BY a.created_at DESC";

const GET_ONE_QUERY: &str = "\
    SELECT a.id, a.name, a.asset_type, a.status, a.location, a.owner, a.tags, a.notes, \
           a.purchase_date, a.serial_number, a.device_id, a.agent_id, a.ssh_target_id, \
           a.created_at, a.updated_at, \
           d.is_online AS device_online, d.last_seen_at AS device_last_seen, \
           d.mac AS device_mac, \
           (SELECT di.ip FROM device_ips di WHERE di.device_id = d.id ORDER BY di.seen_at DESC LIMIT 1) AS device_ip, \
           ag.name AS agent_name, ar.os_name AS agent_os_name, ar.os_version AS agent_os_version, \
           ar.reported_at AS agent_last_report, \
           st.name AS ssh_name, sr.os_name AS ssh_os_name, sr.os_version AS ssh_os_version, \
           sr.reported_at AS ssh_last_report, st.poll_interval_secs AS ssh_poll_interval \
    FROM assets a \
    LEFT JOIN devices d ON d.id = a.device_id \
    LEFT JOIN agents ag ON ag.id = a.agent_id \
    LEFT JOIN agent_reports ar ON ar.agent_id = ag.id \
      AND ar.id = (SELECT ar2.id FROM agent_reports ar2 WHERE ar2.agent_id = ag.id ORDER BY ar2.reported_at DESC LIMIT 1) \
    LEFT JOIN ssh_targets st ON st.id = a.ssh_target_id \
    LEFT JOIN ssh_reports sr ON sr.target_id = st.id \
      AND sr.id = (SELECT sr2.id FROM ssh_reports sr2 WHERE sr2.target_id = st.id ORDER BY sr2.reported_at DESC LIMIT 1) \
    WHERE a.id = ?";

// ─── Handlers ────────────────────────────────────────────

/// GET /api/v1/assets — list all assets with optional filters.
pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<ListQuery>,
) -> Result<Json<Vec<Asset>>, StatusCode> {
    // Start with the base query, then apply filters dynamically.
    let mut sql = String::from(LIST_QUERY);
    let mut binds: Vec<String> = Vec::new();

    let has_filters = params.asset_type.is_some()
        || params.tag.is_some()
        || params.status.is_some()
        || params.location.is_some();

    // Replace ORDER BY with WHERE clauses if we have filters.
    if has_filters {
        // We need to inject WHERE conditions before the ORDER BY.
        // The LIST_QUERY already has ORDER BY at the end, so we insert before it.
        sql = sql.replace("ORDER BY a.created_at DESC", "");

        let mut conditions = Vec::new();

        if let Some(ref t) = params.asset_type {
            conditions.push("a.asset_type = ?".to_string());
            binds.push(t.clone());
        }
        if let Some(ref tag) = params.tag {
            // Search for tag in JSON array-like text field.
            conditions.push("a.tags LIKE ?".to_string());
            binds.push(format!("%{tag}%"));
        }
        if let Some(ref s) = params.status {
            conditions.push("a.status = ?".to_string());
            binds.push(s.clone());
        }
        if let Some(ref loc) = params.location {
            conditions.push("a.location = ?".to_string());
            binds.push(loc.clone());
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        sql.push_str(" ORDER BY a.created_at DESC");
    }

    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }

    let rows = query.fetch_all(&state.db).await.map_err(|e| {
        error!("Failed to list assets: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let assets: Vec<Asset> = rows
        .into_iter()
        .filter_map(|r| {
            asset_from_row(r)
                .map_err(|e| error!("Failed to parse asset row: {e}"))
                .ok()
        })
        .collect();

    Ok(Json(assets))
}

/// GET /api/v1/assets/:id — get a single asset with linked data.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Asset>, AppError> {
    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let asset = asset_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse asset row: {e}")))?;

    Ok(Json(asset))
}

/// POST /api/v1/assets — create a new asset.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<AssetRequest>,
) -> Result<(StatusCode, Json<Asset>), AppError> {
    let name = body.name.as_deref().map(|s| s.trim()).unwrap_or("");
    if name.is_empty() {
        return Err(AppError::Validation("name is required".to_string()));
    }

    let asset_type = body.asset_type.as_deref().unwrap_or("unknown");
    if !VALID_ASSET_TYPES.contains(&asset_type) {
        return Err(AppError::Validation(format!(
            "invalid asset_type '{asset_type}'. Valid types: {}",
            VALID_ASSET_TYPES.join(", ")
        )));
    }

    let status = body.status.as_deref().unwrap_or("active");
    if !VALID_STATUSES.contains(&status) {
        return Err(AppError::Validation(format!(
            "invalid status '{status}'. Valid statuses: {}",
            VALID_STATUSES.join(", ")
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO assets (id, name, asset_type, status, location, owner, tags, notes, purchase_date, serial_number, device_id, agent_id, ssh_target_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(asset_type)
    .bind(status)
    .bind(body.location.as_deref().map(|s| s.trim()))
    .bind(body.owner.as_deref().map(|s| s.trim()))
    .bind(body.tags.as_deref())
    .bind(body.notes.as_deref())
    .bind(body.purchase_date.as_deref())
    .bind(body.serial_number.as_deref().map(|s| s.trim()))
    .bind(body.device_id.as_deref())
    .bind(body.agent_id.as_deref())
    .bind(body.ssh_target_id.as_deref())
    .execute(&state.db)
    .await?;

    info!(asset_id = %id, name = name, "Asset created");

    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_one(&state.db)
        .await?;

    let asset = asset_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse asset row: {e}")))?;

    Ok((StatusCode::CREATED, Json(asset)))
}

/// PUT /api/v1/assets/:id — update an asset.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AssetRequest>,
) -> Result<Json<Asset>, AppError> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM assets WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .is_some();

    if !exists {
        return Err(AppError::NotFound);
    }

    if let Some(ref t) = body.asset_type {
        if !VALID_ASSET_TYPES.contains(&t.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid asset_type '{t}'. Valid types: {}",
                VALID_ASSET_TYPES.join(", ")
            )));
        }
    }

    if let Some(ref s) = body.status {
        if !VALID_STATUSES.contains(&s.as_str()) {
            return Err(AppError::Validation(format!(
                "invalid status '{s}'. Valid statuses: {}",
                VALID_STATUSES.join(", ")
            )));
        }
    }

    // Build SET clauses dynamically — only update fields that are provided.
    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<Option<String>> = Vec::new();

    if let Some(ref v) = body.name {
        sets.push("name = ?".to_string());
        binds.push(Some(v.trim().to_string()));
    }
    if let Some(ref v) = body.asset_type {
        sets.push("asset_type = ?".to_string());
        binds.push(Some(v.clone()));
    }
    if let Some(ref v) = body.status {
        sets.push("status = ?".to_string());
        binds.push(Some(v.clone()));
    }
    if body.location.is_some() {
        sets.push("location = ?".to_string());
        binds.push(body.location.as_ref().map(|s| s.trim().to_string()));
    }
    if body.owner.is_some() {
        sets.push("owner = ?".to_string());
        binds.push(body.owner.as_ref().map(|s| s.trim().to_string()));
    }
    if body.tags.is_some() {
        sets.push("tags = ?".to_string());
        binds.push(body.tags.clone());
    }
    if body.notes.is_some() {
        sets.push("notes = ?".to_string());
        binds.push(body.notes.clone());
    }
    if body.purchase_date.is_some() {
        sets.push("purchase_date = ?".to_string());
        binds.push(body.purchase_date.clone());
    }
    if body.serial_number.is_some() {
        sets.push("serial_number = ?".to_string());
        binds.push(body.serial_number.as_ref().map(|s| s.trim().to_string()));
    }
    if body.device_id.is_some() {
        sets.push("device_id = ?".to_string());
        binds.push(body.device_id.clone());
    }
    if body.agent_id.is_some() {
        sets.push("agent_id = ?".to_string());
        binds.push(body.agent_id.clone());
    }
    if body.ssh_target_id.is_some() {
        sets.push("ssh_target_id = ?".to_string());
        binds.push(body.ssh_target_id.clone());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE assets SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await?;

    info!(asset_id = %id, "Asset updated");

    let row = sqlx::query(GET_ONE_QUERY)
        .bind(&id)
        .fetch_one(&state.db)
        .await?;

    let asset = asset_from_row(row)
        .map_err(|e| AppError::Internal(format!("Failed to parse asset row: {e}")))?;

    Ok(Json(asset))
}

/// DELETE /api/v1/assets/:id — delete an asset.
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM assets WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            info!(asset_id = %id, "Asset deleted");
            StatusCode::NO_CONTENT
        }
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete asset {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

/// POST /api/v1/assets/import — bulk import assets from parsed CSV rows.
pub async fn import(
    State(state): State<AppState>,
    Json(body): Json<ImportRequest>,
) -> Result<Json<ImportResponse>, AppError> {
    let mut imported = 0usize;
    let mut skipped = 0usize;
    let mut errors = Vec::new();

    for (i, row) in body.rows.iter().enumerate() {
        let line = i + 1;
        let name = row.name.trim();
        if name.is_empty() {
            errors.push(format!("Row {line}: name is empty, skipped"));
            skipped += 1;
            continue;
        }

        let asset_type = row.asset_type.as_deref().unwrap_or("unknown");
        if !VALID_ASSET_TYPES.contains(&asset_type) {
            errors.push(format!(
                "Row {line}: invalid asset_type '{asset_type}', using 'unknown'"
            ));
        }
        let asset_type = if VALID_ASSET_TYPES.contains(&asset_type) {
            asset_type
        } else {
            "unknown"
        };

        let status = row.status.as_deref().unwrap_or("active");
        let status = if VALID_STATUSES.contains(&status) {
            status
        } else {
            warn!("Row {line}: invalid status '{status}', using 'active'");
            "active"
        };

        let id = uuid::Uuid::new_v4().to_string();

        match sqlx::query(
            "INSERT INTO assets (id, name, asset_type, status, location, owner, tags, notes, purchase_date, serial_number) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(name)
        .bind(asset_type)
        .bind(status)
        .bind(row.location.as_deref().map(|s| s.trim()))
        .bind(row.owner.as_deref().map(|s| s.trim()))
        .bind(row.tags.as_deref())
        .bind(row.notes.as_deref())
        .bind(row.purchase_date.as_deref())
        .bind(row.serial_number.as_deref().map(|s| s.trim()))
        .execute(&state.db)
        .await
        {
            Ok(_) => imported += 1,
            Err(e) => {
                errors.push(format!("Row {line}: database error — {e}"));
                skipped += 1;
            }
        }
    }

    info!(imported, skipped, "Bulk asset import completed");

    Ok(Json(ImportResponse {
        imported,
        skipped,
        errors,
    }))
}

/// POST /api/v1/assets/auto-link — automatically link unlinked assets to
/// discovered network devices by matching name or hostname.
pub async fn auto_link(State(state): State<AppState>) -> Result<Json<AutoLinkResponse>, AppError> {
    // Find assets that have no device_id linked.
    let unlinked_rows = sqlx::query("SELECT id, name FROM assets WHERE device_id IS NULL")
        .fetch_all(&state.db)
        .await?;

    let mut linked = 0usize;
    let mut details = Vec::new();

    for row in &unlinked_rows {
        let asset_id: String = row.try_get("id").unwrap_or_default();
        let asset_name: String = row.try_get("name").unwrap_or_default();
        let name_lower = asset_name.to_lowercase();

        // Try to match by device name or hostname (case-insensitive).
        let device_row = sqlx::query(
            "SELECT id, COALESCE(name, hostname) AS display_name FROM devices \
             WHERE LOWER(COALESCE(name, '')) = ? OR LOWER(COALESCE(hostname, '')) = ? \
             LIMIT 1",
        )
        .bind(&name_lower)
        .bind(&name_lower)
        .fetch_optional(&state.db)
        .await?;

        if let Some(dev) = device_row {
            let device_id: String = dev.try_get("id").unwrap_or_default();
            let display_name: String = dev.try_get("display_name").unwrap_or_default();

            sqlx::query(
                "UPDATE assets SET device_id = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(&device_id)
            .bind(&asset_id)
            .execute(&state.db)
            .await?;

            details.push(format!(
                "Linked asset '{}' to device '{}'",
                asset_name, display_name
            ));
            linked += 1;
        }
    }

    info!(linked, "Auto-link assets to devices completed");

    Ok(Json(AutoLinkResponse { linked, details }))
}

/// Response for sync-from-devices operation.
#[derive(Debug, Serialize)]
pub struct SyncFromDevicesResponse {
    pub created: usize,
    pub skipped: usize,
    pub details: Vec<String>,
}

/// POST /api/v1/assets/sync-from-devices — create assets for discovered
/// devices that don't already have a linked asset.
pub async fn sync_from_devices(
    State(state): State<AppState>,
) -> Result<Json<SyncFromDevicesResponse>, AppError> {
    // Load discovered devices and whether each device is already linked to an asset.
    let rows = sqlx::query(
        "SELECT d.id, d.name, d.hostname, d.mac, d.device_type, d.location, \
                d.owner, d.serial_number, \
                (SELECT ag.id FROM agents ag WHERE ag.device_id = d.id LIMIT 1) AS linked_agent_id, \
                (SELECT a.id FROM assets a WHERE a.device_id = d.id LIMIT 1) AS linked_asset_id \
         FROM devices d",
    )
    .fetch_all(&state.db)
    .await?;

    info!(
        devices_found = rows.len(),
        "Sync assets from devices started"
    );

    let mut created = 0usize;
    let mut skipped = 0usize;
    let mut details = Vec::new();

    for row in &rows {
        let device_id: String = row.try_get("id").unwrap_or_default();
        let device_name = non_empty_trimmed(row.try_get("name").ok().flatten());
        let hostname = non_empty_trimmed(row.try_get("hostname").ok().flatten());
        let mac = row
            .try_get::<String, _>("mac")
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_default();
        let device_type = non_empty_trimmed(row.try_get("device_type").ok().flatten());
        let location = non_empty_trimmed(row.try_get("location").ok().flatten());
        let owner = non_empty_trimmed(row.try_get("owner").ok().flatten());
        let serial_number = non_empty_trimmed(row.try_get("serial_number").ok().flatten());
        let linked_agent_id = non_empty_trimmed(row.try_get("linked_agent_id").ok().flatten());
        let linked_asset_id: Option<String> = row.try_get("linked_asset_id").ok().flatten();

        // Only skip when an asset is already linked to this specific device.
        if let Some(asset_id) = linked_asset_id {
            skipped += 1;
            details.push(format!(
                "Skipped device '{}' (already linked to asset '{}')",
                device_id, asset_id
            ));
            info!(
                device_id = %device_id,
                asset_id = %asset_id,
                "Skipping device during sync: already linked to asset"
            );
            continue;
        }

        // Use first non-empty identifier: name, hostname, then MAC.
        let asset_name = match device_name
            .as_deref()
            .or(hostname.as_deref())
            .or((!mac.is_empty()).then_some(mac.as_str()))
        {
            Some(name) => name,
            None => {
                warn!(
                    device_id = %device_id,
                    "Skipped device during asset sync: missing name, hostname, and MAC"
                );
                details.push(format!(
                    "Skipped device '{}' (missing name/hostname/MAC)",
                    device_id
                ));
                skipped += 1;
                continue;
            }
        };

        let normalized_device_type = device_type.as_deref().map(str::to_ascii_lowercase);

        // Map device_type to asset_type.
        let asset_type = match normalized_device_type.as_deref() {
            Some("computer") | Some("desktop") | Some("laptop") => "workstation",
            Some("server") => "server",
            Some("router") | Some("gateway") => "router",
            Some("switch") => "switch",
            Some("access_point") | Some("ap") => "unknown",
            Some("printer") => "printer",
            Some("phone") | Some("tablet") => "phone",
            Some("nas") | Some("storage") => "nas",
            Some("tv") | Some("media") | Some("iot") | Some("camera") | Some("sensor") => "iot",
            Some("vm") | Some("virtual_machine") => "vm",
            Some("container") => "container",
            _ => "unknown",
        };

        info!(
            device_id = %device_id,
            asset_name = %asset_name,
            asset_type = %asset_type,
            "Creating asset from discovered device"
        );

        let id = uuid::Uuid::new_v4().to_string();

        match sqlx::query(
            "INSERT INTO assets (id, name, asset_type, status, location, owner, serial_number, device_id, agent_id) \
             VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(asset_name)
        .bind(asset_type)
        .bind(location.as_deref())
        .bind(owner.as_deref())
        .bind(serial_number.as_deref())
        .bind(&device_id)
        .bind(linked_agent_id.as_deref())
        .execute(&state.db)
        .await
        {
            Ok(_) => {
                details.push(format!(
                    "Created asset '{}' from device '{}'",
                    asset_name, device_id
                ));
                info!(
                    device_id = %device_id,
                    asset_id = %id,
                    "Created asset from discovered device"
                );
                created += 1;
            }
            Err(e) => {
                warn!(device_id = %device_id, "Failed to create asset from device: {e}");
                details.push(format!(
                    "Skipped device '{}' (failed to create asset: {})",
                    device_id, e
                ));
                skipped += 1;
            }
        }
    }

    info!(
        devices_found = rows.len(),
        created, skipped, "Sync assets from devices completed"
    );

    Ok(Json(SyncFromDevicesResponse {
        created,
        skipped,
        details,
    }))
}

#[cfg(test)]
mod tests {
    use crate::db;

    use super::{asset_from_row, sync_from_devices, GET_ONE_QUERY, LIST_QUERY};

    #[tokio::test]
    async fn test_asset_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO assets (id, name, asset_type, location, owner, tags) \
             VALUES (?, 'web-server-01', 'server', 'DC-1 Rack A', 'ops-team', '[\"production\",\"web\"]')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(count, 1);

        // Verify default status
        let status: String = sqlx::query_scalar("SELECT status FROM assets WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(status, "active");

        // Update
        sqlx::query("UPDATE assets SET name = 'web-server-02' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Update failed");

        let name: String = sqlx::query_scalar("SELECT name FROM assets WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(name, "web-server-02");

        // Delete
        sqlx::query("DELETE FROM assets WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Delete failed");

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(remaining, 0);
    }

    /// Insert fixture data for devices, device_ips, agents, agent_reports,
    /// ssh_targets, ssh_reports, and assets — then return the asset id.
    async fn insert_fixtures(pool: &sqlx::SqlitePool) -> String {
        let device_id = "dev-001";
        let agent_id = "agent-001";
        let ssh_target_id = "ssh-001";
        let asset_id = uuid::Uuid::new_v4().to_string();

        // Device
        sqlx::query(
            "INSERT INTO devices (id, mac, name, hostname, first_seen_at, last_seen_at, is_online) \
             VALUES ('dev-001', 'AA:BB:CC:DD:EE:FF', 'switch-core', 'switch-core.local', \
                     '2024-01-01 00:00:00', '2024-06-15 12:00:00', 1)",
        )
        .execute(pool)
        .await
        .expect("Insert device failed");

        // Device IP
        sqlx::query(
            "INSERT INTO device_ips (device_id, ip, subnet, seen_at) \
             VALUES ('dev-001', '10.0.0.1', '10.0.0.0/24', '2024-06-15 12:00:00')",
        )
        .execute(pool)
        .await
        .expect("Insert device_ip failed");

        // Agent
        sqlx::query(
            "INSERT INTO agents (id, api_key_hash, name) \
             VALUES ('agent-001', 'hash123', 'monitoring-agent')",
        )
        .execute(pool)
        .await
        .expect("Insert agent failed");

        // Agent report
        sqlx::query(
            "INSERT INTO agent_reports (agent_id, reported_at, os_name, os_version) \
             VALUES ('agent-001', '2024-06-15 12:00:00', 'Ubuntu', '22.04')",
        )
        .execute(pool)
        .await
        .expect("Insert agent_report failed");

        // SSH target
        sqlx::query(
            "INSERT INTO ssh_targets (id, name, host, port, username, auth_type, poll_interval_secs) \
             VALUES ('ssh-001', 'bastion', '10.0.0.99', 22, 'admin', 'key', 120)",
        )
        .execute(pool)
        .await
        .expect("Insert ssh_target failed");

        // SSH report
        sqlx::query(
            "INSERT INTO ssh_reports (target_id, os_name, os_version, reported_at) \
             VALUES ('ssh-001', 'Debian', '12', '2024-06-15 12:00:00')",
        )
        .execute(pool)
        .await
        .expect("Insert ssh_report failed");

        // Asset linked to device, agent, and ssh target
        sqlx::query(
            "INSERT INTO assets (id, name, asset_type, location, owner, tags, device_id, agent_id, ssh_target_id) \
             VALUES (?, 'web-server-01', 'server', 'DC-1', 'ops-team', '[\"production\"]', ?, ?, ?)",
        )
        .bind(&asset_id)
        .bind(device_id)
        .bind(agent_id)
        .bind(ssh_target_id)
        .execute(pool)
        .await
        .expect("Insert asset failed");

        asset_id
    }

    #[tokio::test]
    async fn test_list_query() {
        let pool = db::init(":memory:").await.expect("DB init failed");
        let asset_id = insert_fixtures(&pool).await;

        // Also insert a standalone asset (no linked device/agent/ssh)
        sqlx::query(
            "INSERT INTO assets (id, name, asset_type) VALUES ('standalone', 'printer-01', 'printer')",
        )
        .execute(&pool)
        .await
        .expect("Insert standalone asset failed");

        // Execute LIST_QUERY — this is the actual query used by the API handler
        let rows = sqlx::query(LIST_QUERY)
            .fetch_all(&pool)
            .await
            .expect("LIST_QUERY failed");

        assert_eq!(rows.len(), 2, "Expected 2 assets from LIST_QUERY");

        // Parse every row through asset_from_row to catch column-name mismatches
        let assets: Vec<super::Asset> = rows
            .into_iter()
            .map(|r| asset_from_row(r).expect("asset_from_row failed"))
            .collect();

        // Results are ordered by created_at DESC, so standalone comes first
        let standalone = assets.iter().find(|a| a.id == "standalone").unwrap();
        assert_eq!(standalone.name, "printer-01");
        assert_eq!(standalone.asset_type, "printer");
        assert_eq!(standalone.status, "active");
        assert!(standalone.ip.is_none());
        assert!(standalone.agent_name.is_none());
        assert!(standalone.ssh_name.is_none());

        let linked = assets.iter().find(|a| a.id == asset_id).unwrap();
        assert_eq!(linked.name, "web-server-01");
        assert_eq!(linked.asset_type, "server");
        assert_eq!(linked.status, "active");
        assert_eq!(linked.location.as_deref(), Some("DC-1"));
        assert_eq!(linked.owner.as_deref(), Some("ops-team"));
        // Device data
        assert_eq!(linked.ip.as_deref(), Some("10.0.0.1"));
        assert_eq!(linked.mac.as_deref(), Some("AA:BB:CC:DD:EE:FF"));
        assert_eq!(linked.device_online, Some(true));
        // Agent data
        assert_eq!(linked.agent_name.as_deref(), Some("monitoring-agent"));
        assert_eq!(linked.agent_os.as_deref(), Some("Ubuntu 22.04"));
        // SSH data
        assert_eq!(linked.ssh_name.as_deref(), Some("bastion"));
        assert_eq!(linked.ssh_os.as_deref(), Some("Debian 12"));
    }

    #[tokio::test]
    async fn test_get_one_query() {
        let pool = db::init(":memory:").await.expect("DB init failed");
        let asset_id = insert_fixtures(&pool).await;

        // Execute GET_ONE_QUERY — the actual query used by the get_one handler
        let row = sqlx::query(GET_ONE_QUERY)
            .bind(&asset_id)
            .fetch_one(&pool)
            .await
            .expect("GET_ONE_QUERY failed");

        let asset = asset_from_row(row).expect("asset_from_row failed");

        assert_eq!(asset.id, asset_id);
        assert_eq!(asset.name, "web-server-01");
        assert_eq!(asset.asset_type, "server");
        assert_eq!(asset.status, "active");
        assert_eq!(asset.location.as_deref(), Some("DC-1"));
        assert_eq!(asset.owner.as_deref(), Some("ops-team"));
        assert_eq!(asset.tags.as_deref(), Some("[\"production\"]"));
        // Device data
        assert_eq!(asset.ip.as_deref(), Some("10.0.0.1"));
        assert_eq!(asset.mac.as_deref(), Some("AA:BB:CC:DD:EE:FF"));
        assert_eq!(asset.device_online, Some(true));
        assert_eq!(
            asset.device_last_seen.as_deref(),
            Some("2024-06-15 12:00:00")
        );
        // Agent data
        assert_eq!(asset.agent_name.as_deref(), Some("monitoring-agent"));
        assert_eq!(asset.agent_os.as_deref(), Some("Ubuntu 22.04"));
        // SSH data
        assert_eq!(asset.ssh_name.as_deref(), Some("bastion"));
        assert_eq!(asset.ssh_os.as_deref(), Some("Debian 12"));
    }

    #[tokio::test]
    async fn test_get_one_query_not_found() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let row = sqlx::query(GET_ONE_QUERY)
            .bind("nonexistent-id")
            .fetch_optional(&pool)
            .await
            .expect("GET_ONE_QUERY failed");

        assert!(row.is_none(), "Expected no row for nonexistent asset");
    }

    #[tokio::test]
    async fn test_sync_from_devices_creates_assets_for_unlinked_devices() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        // Three discovered devices with no existing assets.
        sqlx::query(
            "INSERT INTO devices (id, mac, name, hostname, device_type, location, owner, serial_number, first_seen_at, last_seen_at, is_online) \
             VALUES ('dev-001', 'aa:bb:cc:dd:ee:01', NULL, 'router.local', 'router', 'Rack A', 'netops', 'SN-001', '2024-01-01 00:00:00', '2024-01-01 00:00:00', 1), \
                    ('dev-002', 'aa:bb:cc:dd:ee:02', '', 'nas.local', 'nas', NULL, NULL, NULL, '2024-01-01 00:00:00', '2024-01-01 00:00:00', 1), \
                    ('dev-003', 'aa:bb:cc:dd:ee:03', '', '', 'printer', NULL, NULL, NULL, '2024-01-01 00:00:00', '2024-01-01 00:00:00', 1)",
        )
        .execute(&pool)
        .await
        .expect("Insert devices failed");

        sqlx::query(
            "INSERT INTO agents (id, device_id, api_key_hash, name) VALUES ('agent-001', 'dev-001', 'hash123', 'agent')",
        )
        .execute(&pool)
        .await
        .expect("Insert agent failed");

        let state = crate::api::AppState::new(pool.clone(), crate::config::AppConfig::default());
        let axum::Json(response) = sync_from_devices(axum::extract::State(state))
            .await
            .unwrap_or_else(|_| panic!("sync_from_devices failed"));

        assert_eq!(response.created, 3);
        assert_eq!(response.skipped, 0);

        let asset_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM assets")
            .fetch_one(&pool)
            .await
            .expect("Count assets failed");
        assert_eq!(asset_count, 3);

        let dev2_name: String =
            sqlx::query_scalar("SELECT name FROM assets WHERE device_id = 'dev-002'")
                .fetch_one(&pool)
                .await
                .expect("Query asset name for dev-002 failed");
        assert_eq!(dev2_name, "nas.local");

        let dev3_name: String =
            sqlx::query_scalar("SELECT name FROM assets WHERE device_id = 'dev-003'")
                .fetch_one(&pool)
                .await
                .expect("Query asset name for dev-003 failed");
        assert_eq!(dev3_name, "aa:bb:cc:dd:ee:03");

        let dev1_agent: Option<String> =
            sqlx::query_scalar("SELECT agent_id FROM assets WHERE device_id = 'dev-001'")
                .fetch_one(&pool)
                .await
                .expect("Query asset agent_id for dev-001 failed");
        assert_eq!(dev1_agent.as_deref(), Some("agent-001"));
    }
}
