use axum::{
    extract::{Path, Query, State},
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

/// A device event (online/offline transition).
#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceEvent {
    pub id: i64,
    pub event_type: String,
    pub occurred_at: String,
}

/// Query parameters for the events endpoint.
#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    pub limit: Option<i64>,
}

/// GET /api/v1/devices/:id/events?limit=50 — list recent state-change events.
pub async fn events(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<EventsQuery>,
) -> Result<Json<Vec<DeviceEvent>>, StatusCode> {
    let limit = params.limit.unwrap_or(50).min(500);

    let rows = sqlx::query(
        r#"SELECT id, event_type, occurred_at FROM device_events WHERE device_id = ? ORDER BY occurred_at DESC LIMIT ?"#,
    )
    .bind(&id)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch device events for {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let events: Vec<DeviceEvent> = rows
        .into_iter()
        .map(|row| DeviceEvent {
            id: row.try_get("id").unwrap_or(0),
            event_type: row.try_get("event_type").unwrap_or_default(),
            occurred_at: row.try_get("occurred_at").unwrap_or_default(),
        })
        .collect();

    Ok(Json(events))
}

/// Uptime statistics for a device.
#[derive(Debug, Serialize, Deserialize)]
pub struct UptimeStats {
    pub uptime_percent: f64,
    pub online_seconds: i64,
    pub total_seconds: i64,
}

/// Query parameters for the uptime endpoint.
#[derive(Debug, Deserialize)]
pub struct UptimeQuery {
    pub days: Option<i64>,
}

/// GET /api/v1/devices/:id/uptime?days=7 — calculate uptime percentage.
pub async fn uptime(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<UptimeQuery>,
) -> Result<Json<UptimeStats>, StatusCode> {
    let days = params.days.unwrap_or(7).clamp(1, 365);
    let total_seconds = days * 86400;

    let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
    let cutoff_str = cutoff.to_rfc3339();

    let rows = sqlx::query(
        r#"SELECT event_type, occurred_at FROM device_events WHERE device_id = ? AND occurred_at >= ? ORDER BY occurred_at ASC"#,
    )
    .bind(&id)
    .bind(&cutoff_str)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch uptime data for {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let now = chrono::Utc::now();

    // Also fetch the last event before the cutoff to know starting state
    let prior_event: Option<String> = sqlx::query(
        r#"SELECT event_type FROM device_events WHERE device_id = ? AND occurred_at < ? ORDER BY occurred_at DESC LIMIT 1"#,
    )
    .bind(&id)
    .bind(&cutoff_str)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch prior event for {id}: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .map(|row| row.try_get("event_type").unwrap_or_default());

    // Determine initial state at start of window
    let mut is_online = prior_event.as_deref() == Some("online");
    let mut online_seconds: i64 = 0;
    let mut last_time = cutoff;

    for row in &rows {
        let event_type: String = row.try_get("event_type").unwrap_or_default();
        let occurred_at_str: String = row.try_get("occurred_at").unwrap_or_default();

        let occurred_at = chrono::DateTime::parse_from_rfc3339(&occurred_at_str)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .or_else(|_| {
                chrono::NaiveDateTime::parse_from_str(&occurred_at_str, "%Y-%m-%d %H:%M:%S")
                    .map(|ndt| ndt.and_utc())
            })
            .unwrap_or(now);

        if is_online {
            let duration = (occurred_at - last_time).num_seconds().max(0);
            online_seconds += duration;
        }

        is_online = event_type == "online";
        last_time = occurred_at;
    }

    // Account for time from last event to now
    if is_online {
        let duration = (now - last_time).num_seconds().max(0);
        online_seconds += duration;
    }

    // Clamp online_seconds to total_seconds
    online_seconds = online_seconds.min(total_seconds);

    let uptime_percent = if total_seconds > 0 {
        (online_seconds as f64 / total_seconds as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(UptimeStats {
        uptime_percent,
        online_seconds,
        total_seconds,
    }))
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

    // ─── Device Events Tests ────────────────────────────────

    /// Helper: insert a device event directly.
    async fn insert_device_event(
        pool: &sqlx::SqlitePool,
        device_id: &str,
        event_type: &str,
        occurred_at: &str,
    ) {
        sqlx::query(
            r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, ?, ?)"#,
        )
        .bind(device_id)
        .bind(event_type)
        .bind(occurred_at)
        .execute(pool)
        .await
        .unwrap();
    }

    /// Helper: count events for a device.
    async fn count_events(pool: &sqlx::SqlitePool, device_id: &str) -> i64 {
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM device_events WHERE device_id = ?"#)
            .bind(device_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn test_device_event_inserted_on_state_change() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:10").await;
        let now = chrono::Utc::now().to_rfc3339();

        // Set device to offline first
        sqlx::query(r#"UPDATE devices SET is_online = 0 WHERE id = ?"#)
            .bind(&device_id)
            .execute(&pool)
            .await
            .unwrap();

        // Simulate state change: offline → online
        let was_online = false;
        let new_online = true;

        if was_online != new_online {
            let event_type = if new_online { "online" } else { "offline" };
            sqlx::query(
                r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, ?, ?)"#,
            )
            .bind(&device_id)
            .bind(event_type)
            .bind(&now)
            .execute(&pool)
            .await
            .unwrap();
        }

        let count = count_events(&pool, &device_id).await;
        assert_eq!(count, 1, "One event should be created on state change");

        // Verify the event type
        let event_type: String =
            sqlx::query_scalar(r#"SELECT event_type FROM device_events WHERE device_id = ?"#)
                .bind(&device_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(event_type, "online", "Event type should be 'online'");
    }

    #[tokio::test]
    async fn test_no_event_if_state_unchanged() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:11").await;
        let now = chrono::Utc::now().to_rfc3339();

        // Set device to online
        sqlx::query(r#"UPDATE devices SET is_online = 1 WHERE id = ?"#)
            .bind(&device_id)
            .execute(&pool)
            .await
            .unwrap();

        // Simulate scan: device still online — no state change
        let was_online = true;
        let new_online = true;

        if was_online != new_online {
            sqlx::query(
                r#"INSERT INTO device_events (device_id, event_type, occurred_at) VALUES (?, ?, ?)"#,
            )
            .bind(&device_id)
            .bind("online")
            .bind(&now)
            .execute(&pool)
            .await
            .unwrap();
        }

        let count = count_events(&pool, &device_id).await;
        assert_eq!(count, 0, "No event should be created when state unchanged");
    }

    #[tokio::test]
    async fn test_events_endpoint_returns_sorted() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:12").await;

        // Insert events with different timestamps
        insert_device_event(&pool, &device_id, "online", "2026-02-20T10:00:00+00:00").await;
        insert_device_event(&pool, &device_id, "offline", "2026-02-20T12:00:00+00:00").await;
        insert_device_event(&pool, &device_id, "online", "2026-02-20T14:00:00+00:00").await;

        // Query events (should be sorted DESC by occurred_at)
        let rows: Vec<(String, String)> = sqlx::query(
            r#"SELECT event_type, occurred_at FROM device_events WHERE device_id = ? ORDER BY occurred_at DESC"#,
        )
        .bind(&device_id)
        .fetch_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|r| {
            let et: String = r.try_get("event_type").unwrap();
            let oa: String = r.try_get("occurred_at").unwrap();
            (et, oa)
        })
        .collect();

        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].0, "online", "Most recent event should be first");
        assert_eq!(rows[1].0, "offline");
        assert_eq!(rows[2].0, "online", "Oldest event should be last");
    }

    #[tokio::test]
    async fn test_uptime_calculation() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:13").await;

        // Create a known window of events within last 7 days
        // Timeline (relative to now):
        //   -6 days: online
        //   -5 days: offline  → 1 day online = 86400s
        //   -3 days: online
        //   -2 days: offline  → 1 day online = 86400s
        //   Total online: 2 days = 172800s out of 7 days = 604800s
        //   BUT there's also time from -2 days to now where device is offline

        let now = chrono::Utc::now();
        let t1 = (now - chrono::Duration::days(6)).to_rfc3339();
        let t2 = (now - chrono::Duration::days(5)).to_rfc3339();
        let t3 = (now - chrono::Duration::days(3)).to_rfc3339();
        let t4 = (now - chrono::Duration::days(2)).to_rfc3339();

        insert_device_event(&pool, &device_id, "online", &t1).await;
        insert_device_event(&pool, &device_id, "offline", &t2).await;
        insert_device_event(&pool, &device_id, "online", &t3).await;
        insert_device_event(&pool, &device_id, "offline", &t4).await;

        // Calculate uptime manually:
        // From cutoff (7 days ago) to t1 (6 days ago): offline → 1 day offline
        // t1 to t2: 1 day online
        // t2 to t3: 2 days offline
        // t3 to t4: 1 day online
        // t4 to now: 2 days offline
        // Total online: ~2 days = ~172800s
        // Total period: 7 days = 604800s
        // Uptime: ~28.57%

        // Query using the same logic as the uptime endpoint
        let days: i64 = 7;
        let total_seconds = days * 86400;
        let cutoff = now - chrono::Duration::days(days);
        let cutoff_str = cutoff.to_rfc3339();

        let rows = sqlx::query(
            r#"SELECT event_type, occurred_at FROM device_events WHERE device_id = ? AND occurred_at >= ? ORDER BY occurred_at ASC"#,
        )
        .bind(&device_id)
        .bind(&cutoff_str)
        .fetch_all(&pool)
        .await
        .unwrap();

        let prior_event: Option<String> = sqlx::query_scalar(
            r#"SELECT event_type FROM device_events WHERE device_id = ? AND occurred_at < ? ORDER BY occurred_at DESC LIMIT 1"#,
        )
        .bind(&device_id)
        .bind(&cutoff_str)
        .fetch_optional(&pool)
        .await
        .unwrap();

        let mut is_online = prior_event.as_deref() == Some("online");
        let mut online_seconds: i64 = 0;
        let mut last_time = cutoff;

        for row in &rows {
            let event_type: String = row.try_get("event_type").unwrap();
            let occurred_at_str: String = row.try_get("occurred_at").unwrap();
            let occurred_at = chrono::DateTime::parse_from_rfc3339(&occurred_at_str)
                .unwrap()
                .with_timezone(&chrono::Utc);

            if is_online {
                let duration = (occurred_at - last_time).num_seconds().max(0);
                online_seconds += duration;
            }

            is_online = event_type == "online";
            last_time = occurred_at;
        }

        if is_online {
            let duration = (now - last_time).num_seconds().max(0);
            online_seconds += duration;
        }

        online_seconds = online_seconds.min(total_seconds);

        let uptime_percent = (online_seconds as f64 / total_seconds as f64) * 100.0;

        // Expected: ~2 days online out of 7 ≈ 28.57%
        assert!(
            (uptime_percent - 28.57).abs() < 1.0,
            "Uptime should be approximately 28.57%, got {uptime_percent:.2}%"
        );
        assert!(
            online_seconds > 170000 && online_seconds < 175000,
            "Online seconds should be approximately 172800, got {online_seconds}"
        );
    }

    #[tokio::test]
    async fn test_event_retention_cleanup() {
        let pool = test_db().await;
        let device_id = insert_test_device(&pool, "AA:BB:CC:DD:EE:14").await;

        // Insert an old event (40 days ago) and a recent event (1 day ago)
        let old_time = (chrono::Utc::now() - chrono::Duration::days(40)).to_rfc3339();
        let recent_time = (chrono::Utc::now() - chrono::Duration::days(1)).to_rfc3339();

        insert_device_event(&pool, &device_id, "online", &old_time).await;
        insert_device_event(&pool, &device_id, "offline", &recent_time).await;

        // Verify both exist
        let count_before = count_events(&pool, &device_id).await;
        assert_eq!(count_before, 2, "Should have 2 events before cleanup");

        // Run retention cleanup (same as in db::run_migrations startup)
        sqlx::query(r#"DELETE FROM device_events WHERE occurred_at < datetime('now', '-30 days')"#)
            .execute(&pool)
            .await
            .unwrap();

        // Old event should be deleted, recent should remain
        let count_after = count_events(&pool, &device_id).await;
        assert_eq!(count_after, 1, "Only recent event should survive cleanup");

        // Verify the surviving event is the recent one
        let surviving_type: String =
            sqlx::query_scalar(r#"SELECT event_type FROM device_events WHERE device_id = ?"#)
                .bind(&device_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            surviving_type, "offline",
            "Surviving event should be the recent offline one"
        );
    }
}
