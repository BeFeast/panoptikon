use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

/// A device as returned by the API.
#[derive(Debug, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub mac: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub icon: String,
    pub notes: Option<String>,
    pub is_known: bool,
    pub is_favorite: bool,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub is_online: bool,
    /// Current IP address(es) from device_ips table
    pub ips: Vec<String>,
}

/// Request body for creating a device.
#[derive(Debug, Deserialize)]
pub struct CreateDevice {
    pub mac: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
}

/// Request body for updating a device.
#[derive(Debug, Deserialize)]
pub struct UpdateDevice {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub notes: Option<String>,
    pub is_known: Option<bool>,
    pub is_favorite: Option<bool>,
}

impl Device {
    fn from_row(row: sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            mac: row.try_get("mac")?,
            name: row.try_get("name")?,
            hostname: row.try_get("hostname")?,
            vendor: row.try_get("vendor")?,
            icon: row
                .try_get::<String, _>("icon")
                .unwrap_or_else(|_| "device".to_string()),
            notes: row.try_get("notes")?,
            is_known: row.try_get::<i32, _>("is_known").unwrap_or(0) != 0,
            is_favorite: row.try_get::<i32, _>("is_favorite").unwrap_or(0) != 0,
            first_seen_at: row.try_get("first_seen_at")?,
            last_seen_at: row.try_get("last_seen_at")?,
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
            ips: vec![], // populated after query
        })
    }
}

/// GET /api/v1/devices — list all devices.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Device>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, mac, name, hostname, vendor, icon, notes, is_known, is_favorite, \
         first_seen_at, last_seen_at, is_online FROM devices ORDER BY last_seen_at DESC",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list devices: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut devices: Vec<Device> = rows
        .into_iter()
        .filter_map(|r| Device::from_row(r).ok())
        .collect();

    // Fetch current IPs for all devices in one query
    if !devices.is_empty() {
        let ip_rows = sqlx::query(
            "SELECT device_id, ip FROM device_ips WHERE is_current = 1 ORDER BY device_id",
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        for ip_row in ip_rows {
            let device_id: String = ip_row.try_get("device_id").unwrap_or_default();
            let ip: String = ip_row.try_get("ip").unwrap_or_default();
            if let Some(dev) = devices.iter_mut().find(|d| d.id == device_id) {
                dev.ips.push(ip);
            }
        }
    }

    Ok(Json(devices))
}

/// GET /api/v1/devices/:id — get a single device.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Device>, StatusCode> {
    let row = sqlx::query(
        "SELECT id, mac, name, hostname, vendor, icon, notes, is_known, is_favorite, \
         first_seen_at, last_seen_at, is_online FROM devices WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get device {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let device = Device::from_row(row).map_err(|e| {
        tracing::error!("Failed to parse device row: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(device))
}

/// POST /api/v1/devices — create a new device.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<CreateDevice>,
) -> Result<(StatusCode, Json<Device>), StatusCode> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO devices (id, mac, name, hostname, first_seen_at, last_seen_at) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.mac)
    .bind(&body.name)
    .bind(&body.hostname)
    .bind(&now)
    .bind(&now)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create device: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let device = Device {
        id,
        mac: body.mac,
        name: body.name,
        hostname: body.hostname,
        vendor: None,
        icon: "device".to_string(),
        notes: None,
        is_known: false,
        is_favorite: false,
        first_seen_at: now.clone(),
        last_seen_at: now,
        is_online: false,
        ips: vec![],
    };

    Ok((StatusCode::CREATED, Json(device)))
}

/// PATCH /api/v1/devices/:id — update device fields.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDevice>,
) -> Result<StatusCode, StatusCode> {
    let now = chrono::Utc::now().to_rfc3339();

    let result = sqlx::query(
        "UPDATE devices SET \
         name = COALESCE(?, name), \
         icon = COALESCE(?, icon), \
         notes = COALESCE(?, notes), \
         is_known = COALESCE(?, is_known), \
         is_favorite = COALESCE(?, is_favorite), \
         updated_at = ? \
         WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.icon)
    .bind(&body.notes)
    .bind(body.is_known.map(|v| v as i32))
    .bind(body.is_favorite.map(|v| v as i32))
    .bind(&now)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update device {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if result.rows_affected() == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    Ok(StatusCode::NO_CONTENT)
}
