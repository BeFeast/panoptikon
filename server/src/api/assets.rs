use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

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

/// An asset as returned by the API.
#[derive(Debug, Serialize)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub asset_type: String,
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

const LIST_QUERY: &str = "\
    SELECT a.id, a.name, a.asset_type, a.location, a.owner, a.tags, a.notes, \
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
    SELECT a.id, a.name, a.asset_type, a.location, a.owner, a.tags, a.notes, \
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

    // Replace ORDER BY with WHERE clauses if we have filters.
    if params.asset_type.is_some() || params.tag.is_some() {
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

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO assets (id, name, asset_type, location, owner, tags, notes, purchase_date, serial_number, device_id, agent_id, ssh_target_id) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(asset_type)
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

#[cfg(test)]
mod tests {
    use crate::db;

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
}
