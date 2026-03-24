use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info};

use super::AppState;

/// An SNMP configuration entry as returned by the API.
#[derive(Debug, Serialize)]
pub struct SnmpConfig {
    pub id: String,
    pub device_name: String,
    pub host: String,
    pub port: i64,
    pub community: String,
    pub version: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating an SNMP configuration.
#[derive(Debug, Deserialize)]
pub struct CreateSnmpConfigRequest {
    pub device_name: String,
    pub host: String,
    pub port: Option<i64>,
    pub community: Option<String>,
    pub version: Option<String>,
    pub enabled: Option<bool>,
}

/// Request body for updating an SNMP configuration.
#[derive(Debug, Deserialize)]
pub struct UpdateSnmpConfigRequest {
    pub device_name: Option<String>,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub community: Option<String>,
    pub version: Option<String>,
    pub enabled: Option<bool>,
}

const VALID_VERSIONS: &[&str] = &["v1", "v2c", "v3"];

fn config_from_row(row: sqlx::sqlite::SqliteRow) -> Result<SnmpConfig, sqlx::Error> {
    Ok(SnmpConfig {
        id: row.try_get("id")?,
        device_name: row.try_get("device_name")?,
        host: row.try_get("host")?,
        port: row.try_get("port")?,
        community: row.try_get("community")?,
        version: row.try_get("version")?,
        enabled: row.try_get::<i32, _>("enabled").unwrap_or(1) != 0,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

/// GET /api/v1/snmp-configs — list all SNMP configurations.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<SnmpConfig>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, device_name, host, port, community, version, enabled, created_at, updated_at \
         FROM snmp_configs ORDER BY created_at ASC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list SNMP configs: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let configs: Vec<SnmpConfig> = rows
        .into_iter()
        .filter_map(|r| config_from_row(r).ok())
        .collect();

    Ok(Json(configs))
}

/// POST /api/v1/snmp-configs — create a new SNMP configuration.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateSnmpConfigRequest>,
) -> Result<(StatusCode, Json<SnmpConfig>), (StatusCode, String)> {
    let device_name = body.device_name.trim();
    if device_name.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Device name is required".to_string(),
        ));
    }

    let host = body.host.trim();
    if host.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Host is required".to_string()));
    }

    let version = body.version.as_deref().unwrap_or("v2c");
    if !VALID_VERSIONS.contains(&version) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!(
                "Invalid SNMP version '{}'. Valid versions: {}",
                version,
                VALID_VERSIONS.join(", ")
            ),
        ));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let port = body.port.unwrap_or(161);
    let community = body.community.as_deref().unwrap_or("public");
    let enabled = body.enabled.unwrap_or(true);

    sqlx::query(
        "INSERT INTO snmp_configs (id, device_name, host, port, community, version, enabled) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(device_name)
    .bind(host)
    .bind(port)
    .bind(community)
    .bind(version)
    .bind(enabled as i32)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create SNMP config: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    info!(config_id = %id, device_name = device_name, host = host, "SNMP config created");

    let row = sqlx::query(
        "SELECT id, device_name, host, port, community, version, enabled, created_at, updated_at \
         FROM snmp_configs WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch created SNMP config: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    let config = config_from_row(row).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse row: {e}"),
        )
    })?;

    Ok((StatusCode::CREATED, Json(config)))
}

/// PUT /api/v1/snmp-configs/:id — update an SNMP configuration.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSnmpConfigRequest>,
) -> Result<Json<SnmpConfig>, (StatusCode, String)> {
    let exists: bool = sqlx::query_scalar::<_, i32>("SELECT 1 FROM snmp_configs WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to check SNMP config existence: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Database error: {e}"),
            )
        })?
        .is_some();

    if !exists {
        return Err((StatusCode::NOT_FOUND, "SNMP config not found".to_string()));
    }

    let mut sets: Vec<String> = Vec::new();
    let mut binds: Vec<String> = Vec::new();

    if let Some(ref device_name) = body.device_name {
        sets.push("device_name = ?".to_string());
        binds.push(device_name.clone());
    }
    if let Some(ref host) = body.host {
        sets.push("host = ?".to_string());
        binds.push(host.clone());
    }
    if let Some(port) = body.port {
        sets.push("port = ?".to_string());
        binds.push(port.to_string());
    }
    if let Some(ref community) = body.community {
        sets.push("community = ?".to_string());
        binds.push(community.clone());
    }
    if let Some(ref version) = body.version {
        if !VALID_VERSIONS.contains(&version.as_str()) {
            return Err((
                StatusCode::BAD_REQUEST,
                format!(
                    "Invalid SNMP version '{}'. Valid versions: {}",
                    version,
                    VALID_VERSIONS.join(", ")
                ),
            ));
        }
        sets.push("version = ?".to_string());
        binds.push(version.clone());
    }
    if let Some(enabled) = body.enabled {
        sets.push("enabled = ?".to_string());
        binds.push((enabled as i32).to_string());
    }

    sets.push("updated_at = datetime('now')".to_string());

    let sql = format!("UPDATE snmp_configs SET {} WHERE id = ?", sets.join(", "));
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }
    query = query.bind(&id);

    query.execute(&state.db).await.map_err(|e| {
        error!("Failed to update SNMP config {id}: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    info!(config_id = %id, "SNMP config updated");

    let row = sqlx::query(
        "SELECT id, device_name, host, port, community, version, enabled, created_at, updated_at \
         FROM snmp_configs WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch updated SNMP config: {e}");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Database error: {e}"),
        )
    })?;

    let config = config_from_row(row).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse row: {e}"),
        )
    })?;

    Ok(Json(config))
}

/// DELETE /api/v1/snmp-configs/:id — delete an SNMP configuration.
pub async fn delete(State(state): State<AppState>, Path(id): Path<String>) -> StatusCode {
    match sqlx::query("DELETE FROM snmp_configs WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            info!(config_id = %id, "SNMP config deleted");
            StatusCode::NO_CONTENT
        }
        Ok(_) => StatusCode::NOT_FOUND,
        Err(e) => {
            error!("Failed to delete SNMP config {id}: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::db;

    #[tokio::test]
    async fn test_snmp_config_crud() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        let id = uuid::Uuid::new_v4().to_string();

        // Create
        sqlx::query(
            "INSERT INTO snmp_configs (id, device_name, host, port, community, version, enabled) \
             VALUES (?, 'Router1', '10.0.0.1', 161, 'public', 'v2c', 1)",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM snmp_configs")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(count, 1);

        // Update
        sqlx::query(
            "UPDATE snmp_configs SET community = 'private', updated_at = datetime('now') WHERE id = ?",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .expect("Update failed");

        let community: String =
            sqlx::query_scalar("SELECT community FROM snmp_configs WHERE id = ?")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .expect("Query failed");
        assert_eq!(community, "private");

        // Delete
        sqlx::query("DELETE FROM snmp_configs WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .expect("Delete failed");

        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM snmp_configs")
            .fetch_one(&pool)
            .await
            .expect("Query failed");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn test_snmp_version_constraint() {
        let pool = db::init(":memory:").await.expect("DB init failed");

        // Valid versions should work
        for version in &["v1", "v2c", "v3"] {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO snmp_configs (id, device_name, host, version) VALUES (?, ?, '10.0.0.1', ?)",
            )
            .bind(&id)
            .bind(format!("dev_{version}"))
            .bind(version)
            .execute(&pool)
            .await
            .unwrap_or_else(|e| panic!("Insert for version '{version}' should succeed: {e}"));
        }

        // Invalid version should fail
        let result = sqlx::query(
            "INSERT INTO snmp_configs (id, device_name, host, version) VALUES ('bad', 'bad_dev', '10.0.0.1', 'v4')",
        )
        .execute(&pool)
        .await;

        assert!(
            result.is_err(),
            "Invalid SNMP version should fail CHECK constraint"
        );
    }
}
