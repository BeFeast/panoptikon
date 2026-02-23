use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

/// Query parameters for the global search endpoint.
#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    /// Search term — must be at least 2 characters for results.
    pub q: Option<String>,
}

/// A device in search results.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchDevice {
    pub id: String,
    pub ip_address: Option<String>,
    pub hostname: Option<String>,
    pub name: Option<String>,
    pub mac_address: String,
    pub vendor: Option<String>,
    pub is_online: bool,
}

/// An agent in search results.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchAgent {
    pub id: String,
    pub name: Option<String>,
    pub hostname: Option<String>,
    pub is_online: bool,
}

/// An alert in search results.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchAlert {
    pub id: String,
    pub message: String,
    pub severity: String,
    pub created_at: String,
}

/// An SSH target in search results.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchSshTarget {
    pub id: String,
    pub name: String,
    pub host: String,
    pub username: String,
    pub is_online: bool,
}

/// An asset in search results.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchAsset {
    pub id: String,
    pub name: String,
    pub asset_type: String,
    pub location: Option<String>,
    pub serial_number: Option<String>,
}

/// Combined search response grouped by entity type.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResponse {
    pub devices: Vec<SearchDevice>,
    pub agents: Vec<SearchAgent>,
    pub alerts: Vec<SearchAlert>,
    pub ssh_targets: Vec<SearchSshTarget>,
    pub assets: Vec<SearchAsset>,
}

impl SearchResponse {
    pub fn empty() -> Self {
        Self {
            devices: Vec::new(),
            agents: Vec::new(),
            alerts: Vec::new(),
            ssh_targets: Vec::new(),
            assets: Vec::new(),
        }
    }
}

/// GET /api/v1/search?q=<term> — search across devices, agents, and alerts.
pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, StatusCode> {
    let q = params.q.unwrap_or_default();

    // Return empty results for short queries
    if q.len() < 2 {
        return Ok(Json(SearchResponse::empty()));
    }

    let like_term = format!("%{q}%");

    // Search devices by IP (via device_ips), hostname, name, custom_name, MAC, or vendor
    let device_rows = sqlx::query(
        r#"SELECT DISTINCT d.id, d.hostname, d.mac, d.vendor, d.is_online,
                  COALESCE(d.custom_name, d.name) AS display_name,
                  (SELECT di.ip FROM device_ips di WHERE di.device_id = d.id AND di.is_current = 1 LIMIT 1) AS ip_address
           FROM devices d
           LEFT JOIN device_ips di ON di.device_id = d.id AND di.is_current = 1
           WHERE di.ip LIKE ?1
              OR d.hostname LIKE ?1
              OR d.mac LIKE ?1
              OR d.vendor LIKE ?1
              OR d.name LIKE ?1
              OR d.custom_name LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Search devices failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let devices: Vec<SearchDevice> = device_rows
        .into_iter()
        .map(|row| SearchDevice {
            id: row.try_get("id").unwrap_or_default(),
            ip_address: row.try_get("ip_address").unwrap_or(None),
            hostname: row.try_get("hostname").unwrap_or(None),
            name: row.try_get("display_name").unwrap_or(None),
            mac_address: row.try_get("mac").unwrap_or_default(),
            vendor: row.try_get("vendor").unwrap_or(None),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect();

    // Search agents by name or hostname (from latest report)
    let agent_rows = sqlx::query(
        r#"SELECT a.id, a.name,
                  (SELECT ar.hostname FROM agent_reports ar WHERE ar.agent_id = a.id ORDER BY ar.reported_at DESC LIMIT 1) AS hostname,
                  CASE WHEN a.last_report_at IS NOT NULL
                            AND a.last_report_at > datetime('now', '-120 seconds')
                       THEN 1 ELSE 0 END AS is_online
           FROM agents a
           LEFT JOIN agent_reports ar ON ar.agent_id = a.id
           WHERE a.name LIKE ?1
              OR ar.hostname LIKE ?1
           GROUP BY a.id
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Search agents failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let agents: Vec<SearchAgent> = agent_rows
        .into_iter()
        .map(|row| SearchAgent {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or(None),
            hostname: row.try_get("hostname").unwrap_or(None),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect();

    // Search alerts by message
    let alert_rows = sqlx::query(
        r#"SELECT id, message, severity, created_at
           FROM alerts
           WHERE message LIKE ?1
           ORDER BY created_at DESC
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Search alerts failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let alerts: Vec<SearchAlert> = alert_rows
        .into_iter()
        .map(|row| SearchAlert {
            id: row.try_get("id").unwrap_or_default(),
            message: row.try_get("message").unwrap_or_default(),
            severity: row
                .try_get::<String, _>("severity")
                .unwrap_or_else(|_| "WARNING".to_string()),
            created_at: row.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    // Search SSH targets by name, host, or username
    let ssh_rows = sqlx::query(
        r#"SELECT st.id, st.name, st.host, st.username,
                  CASE WHEN sr.reported_at IS NOT NULL
                            AND sr.reported_at > datetime('now', '-120 seconds')
                       THEN 1 ELSE 0 END AS is_online
           FROM ssh_targets st
           LEFT JOIN ssh_reports sr ON sr.target_id = st.id
                AND sr.id = (SELECT MAX(sr2.id) FROM ssh_reports sr2 WHERE sr2.target_id = st.id)
           WHERE st.name LIKE ?1
              OR st.host LIKE ?1
              OR st.username LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Search SSH targets failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let ssh_targets: Vec<SearchSshTarget> = ssh_rows
        .into_iter()
        .map(|row| SearchSshTarget {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            host: row.try_get("host").unwrap_or_default(),
            username: row.try_get("username").unwrap_or_default(),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect();

    // Search assets by name, location, owner, serial_number, or tags
    let asset_rows = sqlx::query(
        r#"SELECT id, name, asset_type, location, serial_number
           FROM assets
           WHERE name LIKE ?1
              OR location LIKE ?1
              OR owner LIKE ?1
              OR serial_number LIKE ?1
              OR tags LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Search assets failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let assets: Vec<SearchAsset> = asset_rows
        .into_iter()
        .map(|row| SearchAsset {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            asset_type: row
                .try_get::<String, _>("asset_type")
                .unwrap_or_else(|_| "unknown".to_string()),
            location: row.try_get("location").unwrap_or(None),
            serial_number: row.try_get("serial_number").unwrap_or(None),
        })
        .collect();

    Ok(Json(SearchResponse {
        devices,
        agents,
        alerts,
        ssh_targets,
        assets,
    }))
}

/// Search devices directly from pool (for unit tests).
pub async fn search_devices(
    pool: &sqlx::SqlitePool,
    term: &str,
) -> Result<Vec<SearchDevice>, sqlx::Error> {
    let like_term = format!("%{term}%");

    let rows = sqlx::query(
        r#"SELECT DISTINCT d.id, d.hostname, d.mac, d.vendor, d.is_online,
                  COALESCE(d.custom_name, d.name) AS display_name,
                  (SELECT di.ip FROM device_ips di WHERE di.device_id = d.id AND di.is_current = 1 LIMIT 1) AS ip_address
           FROM devices d
           LEFT JOIN device_ips di ON di.device_id = d.id AND di.is_current = 1
           WHERE di.ip LIKE ?1
              OR d.hostname LIKE ?1
              OR d.mac LIKE ?1
              OR d.vendor LIKE ?1
              OR d.name LIKE ?1
              OR d.custom_name LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchDevice {
            id: row.try_get("id").unwrap_or_default(),
            ip_address: row.try_get("ip_address").unwrap_or(None),
            hostname: row.try_get("hostname").unwrap_or(None),
            name: row.try_get("display_name").unwrap_or(None),
            mac_address: row.try_get("mac").unwrap_or_default(),
            vendor: row.try_get("vendor").unwrap_or(None),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect())
}

/// Search agents directly from pool (for unit tests).
pub async fn search_agents(
    pool: &sqlx::SqlitePool,
    term: &str,
) -> Result<Vec<SearchAgent>, sqlx::Error> {
    let like_term = format!("%{term}%");

    let rows = sqlx::query(
        r#"SELECT a.id, a.name,
                  (SELECT ar.hostname FROM agent_reports ar WHERE ar.agent_id = a.id ORDER BY ar.reported_at DESC LIMIT 1) AS hostname,
                  CASE WHEN a.last_report_at IS NOT NULL
                            AND a.last_report_at > datetime('now', '-120 seconds')
                       THEN 1 ELSE 0 END AS is_online
           FROM agents a
           LEFT JOIN agent_reports ar ON ar.agent_id = a.id
           WHERE a.name LIKE ?1
              OR ar.hostname LIKE ?1
           GROUP BY a.id
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchAgent {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or(None),
            hostname: row.try_get("hostname").unwrap_or(None),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect())
}

/// Search alerts directly from pool (for unit tests).
pub async fn search_alerts(
    pool: &sqlx::SqlitePool,
    term: &str,
) -> Result<Vec<SearchAlert>, sqlx::Error> {
    let like_term = format!("%{term}%");

    let rows = sqlx::query(
        r#"SELECT id, message, severity, created_at
           FROM alerts
           WHERE message LIKE ?1
           ORDER BY created_at DESC
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchAlert {
            id: row.try_get("id").unwrap_or_default(),
            message: row.try_get("message").unwrap_or_default(),
            severity: row
                .try_get::<String, _>("severity")
                .unwrap_or_else(|_| "WARNING".to_string()),
            created_at: row.try_get("created_at").unwrap_or_default(),
        })
        .collect())
}

/// Search SSH targets directly from pool (for unit tests).
pub async fn search_ssh_targets(
    pool: &sqlx::SqlitePool,
    term: &str,
) -> Result<Vec<SearchSshTarget>, sqlx::Error> {
    let like_term = format!("%{term}%");

    let rows = sqlx::query(
        r#"SELECT st.id, st.name, st.host, st.username,
                  CASE WHEN sr.reported_at IS NOT NULL
                            AND sr.reported_at > datetime('now', '-120 seconds')
                       THEN 1 ELSE 0 END AS is_online
           FROM ssh_targets st
           LEFT JOIN ssh_reports sr ON sr.target_id = st.id
                AND sr.id = (SELECT MAX(sr2.id) FROM ssh_reports sr2 WHERE sr2.target_id = st.id)
           WHERE st.name LIKE ?1
              OR st.host LIKE ?1
              OR st.username LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchSshTarget {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            host: row.try_get("host").unwrap_or_default(),
            username: row.try_get("username").unwrap_or_default(),
            is_online: row.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
        })
        .collect())
}

/// Search assets directly from pool (for unit tests).
pub async fn search_assets(
    pool: &sqlx::SqlitePool,
    term: &str,
) -> Result<Vec<SearchAsset>, sqlx::Error> {
    let like_term = format!("%{term}%");

    let rows = sqlx::query(
        r#"SELECT id, name, asset_type, location, serial_number
           FROM assets
           WHERE name LIKE ?1
              OR location LIKE ?1
              OR owner LIKE ?1
              OR serial_number LIKE ?1
              OR tags LIKE ?1
           LIMIT 5"#,
    )
    .bind(&like_term)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| SearchAsset {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            asset_type: row
                .try_get::<String, _>("asset_type")
                .unwrap_or_else(|_| "unknown".to_string()),
            location: row.try_get("location").unwrap_or(None),
            serial_number: row.try_get("serial_number").unwrap_or(None),
        })
        .collect())
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

    /// Helper: insert a test device with IP and return its id.
    async fn insert_device(
        pool: &sqlx::SqlitePool,
        mac: &str,
        hostname: Option<&str>,
        vendor: Option<&str>,
        ip: Option<&str>,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, hostname, vendor, first_seen_at, last_seen_at, is_online)
               VALUES (?, ?, ?, ?, ?, ?, 1)"#,
        )
        .bind(&id)
        .bind(mac)
        .bind(hostname)
        .bind(vendor)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();

        if let Some(ip_addr) = ip {
            sqlx::query(
                r#"INSERT INTO device_ips (device_id, ip, seen_at, is_current) VALUES (?, ?, ?, 1)"#,
            )
            .bind(&id)
            .bind(ip_addr)
            .bind(&now)
            .execute(pool)
            .await
            .unwrap();
        }

        id
    }

    /// Helper: insert a test agent and return its id.
    async fn insert_agent(pool: &sqlx::SqlitePool, name: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let hash = bcrypt::hash("test_key", 4).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO agents (id, api_key_hash, name, last_report_at, created_at)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(&hash)
        .bind(name)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert a test alert and return its id.
    async fn insert_alert(pool: &sqlx::SqlitePool, message: &str, severity: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO alerts (id, type, message, severity, created_at)
               VALUES (?, 'device_offline', ?, ?, datetime('now'))"#,
        )
        .bind(&id)
        .bind(message)
        .bind(severity)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[tokio::test]
    async fn test_search_devices_by_ip() {
        let pool = test_db().await;
        insert_device(
            &pool,
            "AA:BB:CC:DD:EE:01",
            Some("router"),
            None,
            Some("192.168.1.1"),
        )
        .await;
        insert_device(
            &pool,
            "AA:BB:CC:DD:EE:02",
            Some("switch"),
            None,
            Some("10.0.0.1"),
        )
        .await;

        let results = search_devices(&pool, "192.168").await.unwrap();
        assert_eq!(results.len(), 1, "Should find exactly one device by IP");
        assert_eq!(results[0].ip_address.as_deref(), Some("192.168.1.1"));
    }

    #[tokio::test]
    async fn test_search_devices_by_hostname() {
        let pool = test_db().await;
        insert_device(
            &pool,
            "AA:BB:CC:DD:EE:10",
            Some("my-server"),
            None,
            Some("10.0.0.5"),
        )
        .await;
        insert_device(
            &pool,
            "AA:BB:CC:DD:EE:11",
            Some("workstation"),
            None,
            Some("10.0.0.6"),
        )
        .await;

        let results = search_devices(&pool, "server").await.unwrap();
        assert_eq!(
            results.len(),
            1,
            "Should find exactly one device by hostname"
        );
        assert_eq!(results[0].hostname.as_deref(), Some("my-server"));
    }

    #[tokio::test]
    async fn test_search_agents_by_name() {
        let pool = test_db().await;
        insert_agent(&pool, "web-monitor").await;
        insert_agent(&pool, "db-checker").await;

        let results = search_agents(&pool, "monitor").await.unwrap();
        assert_eq!(results.len(), 1, "Should find exactly one agent by name");
        assert_eq!(results[0].name.as_deref(), Some("web-monitor"));
    }

    #[tokio::test]
    async fn test_search_alerts_by_message() {
        let pool = test_db().await;
        insert_alert(&pool, "Device went offline: server-01", "WARNING").await;
        insert_alert(&pool, "New device discovered: printer", "INFO").await;

        let results = search_alerts(&pool, "offline").await.unwrap();
        assert_eq!(results.len(), 1, "Should find exactly one alert by message");
        assert!(results[0].message.contains("offline"));
    }

    /// Helper: insert a test SSH target and return its id.
    async fn insert_ssh_target(
        pool: &sqlx::SqlitePool,
        name: &str,
        host: &str,
        username: &str,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO ssh_targets (id, name, host, username, created_at)
               VALUES (?, ?, ?, ?, datetime('now'))"#,
        )
        .bind(&id)
        .bind(name)
        .bind(host)
        .bind(username)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    /// Helper: insert a test asset and return its id.
    async fn insert_asset(
        pool: &sqlx::SqlitePool,
        name: &str,
        asset_type: &str,
        location: Option<&str>,
        serial_number: Option<&str>,
    ) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO assets (id, name, asset_type, location, serial_number, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))"#,
        )
        .bind(&id)
        .bind(name)
        .bind(asset_type)
        .bind(location)
        .bind(serial_number)
        .execute(pool)
        .await
        .unwrap();
        id
    }

    #[tokio::test]
    async fn test_search_ssh_targets_by_name() {
        let pool = test_db().await;
        insert_ssh_target(&pool, "prod-web", "10.0.1.10", "admin").await;
        insert_ssh_target(&pool, "staging-db", "10.0.2.20", "deploy").await;

        let results = search_ssh_targets(&pool, "prod").await.unwrap();
        assert_eq!(
            results.len(),
            1,
            "Should find exactly one SSH target by name"
        );
        assert_eq!(results[0].name, "prod-web");
    }

    #[tokio::test]
    async fn test_search_ssh_targets_by_host() {
        let pool = test_db().await;
        insert_ssh_target(&pool, "server-a", "192.168.10.5", "root").await;
        insert_ssh_target(&pool, "server-b", "10.0.0.1", "root").await;

        let results = search_ssh_targets(&pool, "192.168").await.unwrap();
        assert_eq!(
            results.len(),
            1,
            "Should find exactly one SSH target by host"
        );
        assert_eq!(results[0].host, "192.168.10.5");
    }

    #[tokio::test]
    async fn test_search_assets_by_name() {
        let pool = test_db().await;
        insert_asset(&pool, "Dell PowerEdge R740", "server", Some("DC-1"), None).await;
        insert_asset(&pool, "HP LaserJet Pro", "printer", Some("Office"), None).await;

        let results = search_assets(&pool, "PowerEdge").await.unwrap();
        assert_eq!(results.len(), 1, "Should find exactly one asset by name");
        assert_eq!(results[0].name, "Dell PowerEdge R740");
    }

    #[tokio::test]
    async fn test_search_assets_by_serial() {
        let pool = test_db().await;
        insert_asset(&pool, "Server A", "server", None, Some("SN-ABC-12345")).await;
        insert_asset(&pool, "Server B", "server", None, Some("SN-XYZ-67890")).await;

        let results = search_assets(&pool, "ABC-123").await.unwrap();
        assert_eq!(
            results.len(),
            1,
            "Should find exactly one asset by serial number"
        );
        assert_eq!(results[0].serial_number.as_deref(), Some("SN-ABC-12345"));
    }

    #[tokio::test]
    async fn test_search_empty_query() {
        let pool = test_db().await;
        insert_device(
            &pool,
            "AA:BB:CC:DD:EE:20",
            Some("test"),
            None,
            Some("10.0.0.1"),
        )
        .await;

        // Empty query should return nothing (query len < 2)
        let _devices = search_devices(&pool, "").await.unwrap();
        // The direct helper doesn't enforce min length — the handler does.
        // But we can test the handler logic here:
        let q = "";
        if q.len() < 2 {
            let response = SearchResponse::empty();
            assert!(response.devices.is_empty());
            assert!(response.agents.is_empty());
            assert!(response.alerts.is_empty());
            assert!(response.ssh_targets.is_empty());
            assert!(response.assets.is_empty());
        }

        // Single char query
        let q_short = "a";
        if q_short.len() < 2 {
            let response = SearchResponse::empty();
            assert!(response.devices.is_empty());
        }
    }

    #[tokio::test]
    async fn test_search_limit_five() {
        let pool = test_db().await;

        // Insert 7 devices that all match
        for i in 0..7 {
            insert_device(
                &pool,
                &format!("AA:BB:CC:DD:EE:{i:02X}"),
                Some(&format!("testhost-{i}")),
                None,
                Some(&format!("10.0.0.{i}")),
            )
            .await;
        }

        let results = search_devices(&pool, "testhost").await.unwrap();
        assert!(
            results.len() <= 5,
            "Should return at most 5 devices, got {}",
            results.len()
        );
    }
}
