use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

/// Agent summary attached to a device response.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentSummary {
    pub id: String,
    pub name: Option<String>,
    pub is_online: bool,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
}

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
    /// Linked agent summary (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentSummary>,
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
        let agent = match row.try_get::<Option<String>, _>("agent_id") {
            Ok(Some(agent_id)) => Some(AgentSummary {
                id: agent_id,
                name: row.try_get("agent_name")?,
                is_online: row.try_get::<i32, _>("agent_is_online").unwrap_or(0) != 0,
                cpu_percent: row.try_get("agent_cpu_percent")?,
                memory_percent: row.try_get("agent_memory_percent")?,
            }),
            _ => None,
        };

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
            agent,
        })
    }
}

/// GET /api/v1/devices — list all devices.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<Device>>, StatusCode> {
    let rows = sqlx::query(
        r#"
        SELECT d.id, d.mac, d.name, d.hostname, d.vendor, d.icon, d.notes,
               d.is_known, d.is_favorite, d.first_seen_at, d.last_seen_at, d.is_online,
               a.id AS agent_id,
               a.name AS agent_name,
               r.cpu_percent AS agent_cpu_percent,
               CASE WHEN r.mem_total IS NOT NULL AND r.mem_total > 0
                    THEN CAST(r.mem_used AS REAL) * 100.0 / r.mem_total
                    ELSE NULL END AS agent_memory_percent,
               CASE WHEN a.last_report_at IS NOT NULL
                         AND a.last_report_at > datetime('now', '-120 seconds')
                    THEN 1 ELSE 0 END AS agent_is_online
        FROM devices d
        LEFT JOIN agents a ON a.device_id = d.id
        LEFT JOIN agent_reports r ON r.agent_id = a.id
            AND r.reported_at = (
                SELECT MAX(ar.reported_at) FROM agent_reports ar WHERE ar.agent_id = a.id
            )
        ORDER BY d.last_seen_at DESC
    "#,
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
        r#"
        SELECT d.id, d.mac, d.name, d.hostname, d.vendor, d.icon, d.notes,
               d.is_known, d.is_favorite, d.first_seen_at, d.last_seen_at, d.is_online,
               a.id AS agent_id,
               a.name AS agent_name,
               r.cpu_percent AS agent_cpu_percent,
               CASE WHEN r.mem_total IS NOT NULL AND r.mem_total > 0
                    THEN CAST(r.mem_used AS REAL) * 100.0 / r.mem_total
                    ELSE NULL END AS agent_memory_percent,
               CASE WHEN a.last_report_at IS NOT NULL
                         AND a.last_report_at > datetime('now', '-120 seconds')
                    THEN 1 ELSE 0 END AS agent_is_online
        FROM devices d
        LEFT JOIN agents a ON a.device_id = d.id
        LEFT JOIN agent_reports r ON r.agent_id = a.id
            AND r.reported_at = (
                SELECT MAX(ar.reported_at) FROM agent_reports ar WHERE ar.agent_id = a.id
            )
        WHERE d.id = ?
    "#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to get device {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    let mut device = Device::from_row(row).map_err(|e| {
        tracing::error!("Failed to parse device row: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Fetch current IPs for the device.
    let ip_rows = sqlx::query("SELECT ip FROM device_ips WHERE device_id = ? AND is_current = 1")
        .bind(&id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    for ip_row in ip_rows {
        let ip: String = ip_row.try_get("ip").unwrap_or_default();
        device.ips.push(ip);
    }

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
        agent: None,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    /// Helper: create a fresh in-memory database with all migrations applied.
    async fn test_db() -> sqlx::SqlitePool {
        db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: insert a test device and return its id.
    async fn insert_test_device(pool: &sqlx::SqlitePool, mac: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, first_seen_at, last_seen_at)
               VALUES (?, ?, 'test-device', ?, ?)"#,
        )
        .bind(&id)
        .bind(mac)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert a test agent linked to a device and return its id.
    async fn insert_test_agent(pool: &sqlx::SqlitePool, device_id: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("test_key", 4).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO agents (id, device_id, api_key_hash, name, last_report_at)
               VALUES (?, ?, ?, 'test-agent', ?)"#,
        )
        .bind(&id)
        .bind(device_id)
        .bind(&hash)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert an agent report.
    async fn insert_report(
        pool: &sqlx::SqlitePool,
        agent_id: &str,
        reported_at: &str,
        cpu_percent: f64,
        mem_used: i64,
        mem_total: i64,
    ) {
        sqlx::query(
            r#"INSERT INTO agent_reports (agent_id, reported_at, cpu_percent, mem_used, mem_total)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(agent_id)
        .bind(reported_at)
        .bind(cpu_percent)
        .bind(mem_used)
        .bind(mem_total)
        .execute(pool)
        .await
        .unwrap();
    }

    /// Run the devices list query directly and return parsed Device structs.
    async fn query_devices(pool: &sqlx::SqlitePool) -> Vec<Device> {
        let rows = sqlx::query(
            r#"
            SELECT d.id, d.mac, d.name, d.hostname, d.vendor, d.icon, d.notes,
                   d.is_known, d.is_favorite, d.first_seen_at, d.last_seen_at, d.is_online,
                   a.id AS agent_id,
                   a.name AS agent_name,
                   r.cpu_percent AS agent_cpu_percent,
                   CASE WHEN r.mem_total IS NOT NULL AND r.mem_total > 0
                        THEN CAST(r.mem_used AS REAL) * 100.0 / r.mem_total
                        ELSE NULL END AS agent_memory_percent,
                   CASE WHEN a.last_report_at IS NOT NULL
                             AND a.last_report_at > datetime('now', '-120 seconds')
                        THEN 1 ELSE 0 END AS agent_is_online
            FROM devices d
            LEFT JOIN agents a ON a.device_id = d.id
            LEFT JOIN agent_reports r ON r.agent_id = a.id
                AND r.reported_at = (
                    SELECT MAX(ar.reported_at) FROM agent_reports ar WHERE ar.agent_id = a.id
                )
            ORDER BY d.last_seen_at DESC
        "#,
        )
        .fetch_all(pool)
        .await
        .unwrap();

        rows.into_iter()
            .filter_map(|r| Device::from_row(r).ok())
            .collect()
    }

    #[tokio::test]
    async fn test_list_devices_no_agent() {
        let pool = test_db().await;
        insert_test_device(&pool, "AA:BB:CC:DD:EE:01").await;

        let devices = query_devices(&pool).await;
        assert_eq!(devices.len(), 1);
        assert!(
            devices[0].agent.is_none(),
            "Device without linked agent should have agent = None"
        );
    }

    #[tokio::test]
    async fn test_list_devices_with_agent() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:02").await;
        let agent_id = insert_test_agent(&pool, &device_id).await;
        let now = chrono::Utc::now().to_rfc3339();
        insert_report(&pool, &agent_id, &now, 45.5, 2048, 4096).await;

        let devices = query_devices(&pool).await;
        assert_eq!(devices.len(), 1);
        let agent = devices[0]
            .agent
            .as_ref()
            .expect("Device with linked agent should have agent populated");
        assert_eq!(agent.id, agent_id);
        assert!(agent.is_online, "Agent with recent report should be online");
        assert!(
            (agent.cpu_percent.unwrap() - 45.5).abs() < 0.01,
            "cpu_percent should be 45.5"
        );
        assert!(
            (agent.memory_percent.unwrap() - 50.0).abs() < 0.01,
            "memory_percent should be 50.0 (2048/4096*100)"
        );
    }

    #[tokio::test]
    async fn test_list_devices_agent_offline() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:03").await;
        let agent_id = insert_test_agent(&pool, &device_id).await;

        // Set last_report_at to a stale time (> 120 seconds ago).
        let stale_time = "2020-01-01T00:00:00Z";
        sqlx::query("UPDATE agents SET last_report_at = ? WHERE id = ?")
            .bind(stale_time)
            .bind(&agent_id)
            .execute(&pool)
            .await
            .unwrap();
        insert_report(&pool, &agent_id, stale_time, 10.0, 100, 1000).await;

        let devices = query_devices(&pool).await;
        assert_eq!(devices.len(), 1);
        let agent = devices[0]
            .agent
            .as_ref()
            .expect("Device with linked agent should have agent populated");
        assert!(
            !agent.is_online,
            "Agent with stale report should be offline"
        );
    }

    #[tokio::test]
    async fn test_memory_percent_calculation() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:04").await;
        let agent_id = insert_test_agent(&pool, &device_id).await;
        let now = chrono::Utc::now().to_rfc3339();

        // mem_used=1024, mem_total=4096 → 25.0%
        insert_report(&pool, &agent_id, &now, 0.0, 1024, 4096).await;

        let devices = query_devices(&pool).await;
        let agent = devices[0].agent.as_ref().unwrap();
        assert!(
            (agent.memory_percent.unwrap() - 25.0).abs() < 0.01,
            "memory_percent should be 25.0 (1024/4096*100)"
        );
    }

    #[tokio::test]
    async fn test_memory_percent_zero_total() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:05").await;
        let agent_id = insert_test_agent(&pool, &device_id).await;
        let now = chrono::Utc::now().to_rfc3339();

        // mem_total=0 → memory_percent should be None (avoid division by zero)
        insert_report(&pool, &agent_id, &now, 5.0, 100, 0).await;

        let devices = query_devices(&pool).await;
        let agent = devices[0].agent.as_ref().unwrap();
        assert!(
            agent.memory_percent.is_none(),
            "memory_percent should be None when mem_total is 0"
        );
    }
}
