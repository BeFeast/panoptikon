use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, Response, StatusCode},
};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::AppState;

#[derive(Debug, Deserialize)]
pub struct DevicesExportQuery {
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TrafficExportQuery {
    pub format: Option<String>,
    pub minutes: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
struct ExportDevice {
    id: String,
    ip_address: String,
    mac_address: String,
    hostname: Option<String>,
    vendor: Option<String>,
    is_online: bool,
    first_seen_at: String,
    last_seen_at: String,
    mdns_services: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct ExportTrafficSample {
    sampled_at: String,
    device_id: String,
    ip_address: String,
    hostname: String,
    rx_bps: i64,
    tx_bps: i64,
    source: String,
}

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn format_devices_csv(items: &[ExportDevice]) -> String {
    let mut out = String::from(
        "id,ip_address,mac_address,hostname,vendor,is_online,first_seen_at,last_seen_at,mdns_services\n",
    );

    for d in items {
        out.push_str(&csv_escape(&d.id));
        out.push(',');
        out.push_str(&csv_escape(&d.ip_address));
        out.push(',');
        out.push_str(&csv_escape(&d.mac_address));
        out.push(',');
        out.push_str(&csv_escape(d.hostname.as_deref().unwrap_or("")));
        out.push(',');
        out.push_str(&csv_escape(d.vendor.as_deref().unwrap_or("")));
        out.push(',');
        out.push_str(if d.is_online { "true" } else { "false" });
        out.push(',');
        out.push_str(&csv_escape(&d.first_seen_at));
        out.push(',');
        out.push_str(&csv_escape(&d.last_seen_at));
        out.push(',');
        out.push_str(&csv_escape(d.mdns_services.as_deref().unwrap_or("")));
        out.push('\n');
    }

    out
}

fn format_traffic_csv(items: &[ExportTrafficSample]) -> String {
    let mut out = String::from("sampled_at,device_id,ip_address,hostname,rx_bps,tx_bps,source\n");

    for t in items {
        out.push_str(&csv_escape(&t.sampled_at));
        out.push(',');
        out.push_str(&csv_escape(&t.device_id));
        out.push(',');
        out.push_str(&csv_escape(&t.ip_address));
        out.push(',');
        out.push_str(&csv_escape(&t.hostname));
        out.push(',');
        out.push_str(&t.rx_bps.to_string());
        out.push(',');
        out.push_str(&t.tx_bps.to_string());
        out.push(',');
        out.push_str(&csv_escape(&t.source));
        out.push('\n');
    }

    out
}

fn download_response(
    content_type: &str,
    filename: &str,
    body: String,
) -> Result<Response<Body>, StatusCode> {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}\""),
        )
        .body(Body::from(body))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn devices_export(
    State(state): State<AppState>,
    Query(query): Query<DevicesExportQuery>,
) -> Result<Response<Body>, StatusCode> {
    let format = query
        .format
        .unwrap_or_else(|| "csv".to_string())
        .to_lowercase();

    let rows = sqlx::query(
        r#"
        SELECT
            d.id,
            COALESCE(di.ip_address, '') AS ip_address,
            d.mac AS mac_address,
            d.hostname,
            d.vendor,
            d.is_online,
            d.first_seen_at,
            d.last_seen_at,
            d.mdns_services
        FROM devices d
        LEFT JOIN (
            SELECT device_id, MIN(ip) AS ip_address
            FROM device_ips
            WHERE is_current = 1
            GROUP BY device_id
        ) di ON di.device_id = d.id
        ORDER BY d.last_seen_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("devices_export query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let devices: Vec<ExportDevice> = rows
        .into_iter()
        .map(|r| ExportDevice {
            id: r.try_get("id").unwrap_or_default(),
            ip_address: r.try_get("ip_address").unwrap_or_default(),
            mac_address: r.try_get("mac_address").unwrap_or_default(),
            hostname: r.try_get("hostname").unwrap_or(None),
            vendor: r.try_get("vendor").unwrap_or(None),
            is_online: r.try_get::<i32, _>("is_online").unwrap_or(0) != 0,
            first_seen_at: r.try_get("first_seen_at").unwrap_or_default(),
            last_seen_at: r.try_get("last_seen_at").unwrap_or_default(),
            mdns_services: r.try_get("mdns_services").unwrap_or(None),
        })
        .collect();

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();

    if format == "json" {
        let body = serde_json::to_string_pretty(&devices).unwrap_or_else(|_| "[]".to_string());
        download_response(
            "application/json",
            &format!("panoptikon-devices-{date}.json"),
            body,
        )
    } else {
        let body = format_devices_csv(&devices);
        download_response(
            "text/csv; charset=utf-8",
            &format!("panoptikon-devices-{date}.csv"),
            body,
        )
    }
}

pub async fn traffic_export(
    State(state): State<AppState>,
    Query(query): Query<TrafficExportQuery>,
) -> Result<Response<Body>, StatusCode> {
    let format = query
        .format
        .unwrap_or_else(|| "csv".to_string())
        .to_lowercase();
    let minutes = query.minutes.unwrap_or(1440).clamp(1, 10080);

    let rows = sqlx::query(
        r#"
        SELECT
            ts.sampled_at,
            ts.device_id,
            COALESCE(di.ip_address, '') AS ip_address,
            COALESCE(d.hostname, '') AS hostname,
            COALESCE(ts.rx_bps, 0) AS rx_bps,
            COALESCE(ts.tx_bps, 0) AS tx_bps,
            COALESCE(ts.source, '') AS source
        FROM traffic_samples ts
        LEFT JOIN devices d ON d.id = ts.device_id
        LEFT JOIN (
            SELECT device_id, MIN(ip) AS ip_address
            FROM device_ips
            WHERE is_current = 1
            GROUP BY device_id
        ) di ON di.device_id = ts.device_id
        WHERE ts.sampled_at >= datetime('now', '-' || CAST(? AS TEXT) || ' minutes')
        ORDER BY ts.sampled_at ASC
        "#,
    )
    .bind(minutes)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("traffic_export query failed: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let samples: Vec<ExportTrafficSample> = rows
        .into_iter()
        .map(|r| ExportTrafficSample {
            sampled_at: r.try_get("sampled_at").unwrap_or_default(),
            device_id: r.try_get("device_id").unwrap_or_default(),
            ip_address: r.try_get("ip_address").unwrap_or_default(),
            hostname: r.try_get("hostname").unwrap_or_default(),
            rx_bps: r.try_get("rx_bps").unwrap_or(0),
            tx_bps: r.try_get("tx_bps").unwrap_or(0),
            source: r.try_get("source").unwrap_or_default(),
        })
        .collect();

    let date = chrono::Utc::now().format("%Y-%m-%d").to_string();

    if format == "json" {
        let body = serde_json::to_string_pretty(&samples).unwrap_or_else(|_| "[]".to_string());
        download_response(
            "application/json",
            &format!("panoptikon-traffic-{date}.json"),
            body,
        )
    } else {
        let body = format_traffic_csv(&samples);
        download_response(
            "text/csv; charset=utf-8",
            &format!("panoptikon-traffic-{date}.csv"),
            body,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[tokio::test]
    async fn test_devices_csv_format() {
        let devices = vec![ExportDevice {
            id: "dev-1".to_string(),
            ip_address: "10.0.0.5".to_string(),
            mac_address: "AA:BB:CC:DD:EE:FF".to_string(),
            hostname: Some("host1".to_string()),
            vendor: Some("Acme".to_string()),
            is_online: true,
            first_seen_at: "2026-02-20 00:00:00".to_string(),
            last_seen_at: "2026-02-20 01:00:00".to_string(),
            mdns_services: Some("_http._tcp".to_string()),
        }];

        let csv = format_devices_csv(&devices);
        let mut lines = csv.lines();
        assert_eq!(
            lines.next().unwrap_or(""),
            "id,ip_address,mac_address,hostname,vendor,is_online,first_seen_at,last_seen_at,mdns_services"
        );
        let row = lines.next().unwrap_or("");
        assert!(row.contains("dev-1"));
        assert!(row.contains("10.0.0.5"));
        assert!(row.contains("AA:BB:CC:DD:EE:FF"));
        assert!(row.contains("host1"));
        assert!(row.contains("Acme"));
    }

    #[tokio::test]
    async fn test_devices_json_format() {
        let devices = vec![ExportDevice {
            id: "dev-1".to_string(),
            ip_address: "10.0.0.5".to_string(),
            mac_address: "AA:BB:CC:DD:EE:FF".to_string(),
            hostname: Some("host1".to_string()),
            vendor: Some("Acme".to_string()),
            is_online: true,
            first_seen_at: "2026-02-20 00:00:00".to_string(),
            last_seen_at: "2026-02-20 01:00:00".to_string(),
            mdns_services: Some("_http._tcp".to_string()),
        }];

        let body = serde_json::to_string(&devices).unwrap_or_default();
        let parsed: serde_json::Value =
            serde_json::from_str(&body).unwrap_or(serde_json::json!([]));
        assert!(parsed.is_array());
        assert_eq!(parsed[0]["id"], "dev-1");
        assert_eq!(parsed[0]["ip_address"], "10.0.0.5");
    }

    #[tokio::test]
    async fn test_traffic_export_minutes_filter() {
        let pool = db::init(":memory:").await.expect("db init failed");

        let device_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, hostname, first_seen_at, last_seen_at, is_online)
               VALUES (?, 'AA:BB:CC:DD:EE:01', 'host1', datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&device_id)
        .execute(&pool)
        .await
        .expect("insert device failed");

        let recent = (chrono::Utc::now() - chrono::Duration::minutes(10))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();
        let old = (chrono::Utc::now() - chrono::Duration::minutes(120))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string();

        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, ?, 100, 200, 'test')"#,
        )
        .bind(&device_id)
        .bind(&recent)
        .execute(&pool)
        .await
        .expect("insert recent sample failed");

        sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, ?, 300, 400, 'test')"#,
        )
        .bind(&device_id)
        .bind(&old)
        .execute(&pool)
        .await
        .expect("insert old sample failed");

        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT sampled_at
               FROM traffic_samples
               WHERE sampled_at >= datetime('now', '-60 minutes')
               ORDER BY sampled_at ASC"#,
        )
        .fetch_all(&pool)
        .await
        .expect("query failed");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, recent);
    }

    #[tokio::test]
    async fn test_csv_special_chars_escaped() {
        let devices = vec![ExportDevice {
            id: "dev-1".to_string(),
            ip_address: "10.0.0.5".to_string(),
            mac_address: "AA:BB:CC:DD:EE:FF".to_string(),
            hostname: Some("host, \"quoted\"".to_string()),
            vendor: Some("Acme, Inc".to_string()),
            is_online: true,
            first_seen_at: "2026-02-20 00:00:00".to_string(),
            last_seen_at: "2026-02-20 01:00:00".to_string(),
            mdns_services: Some("_http._tcp".to_string()),
        }];

        let csv = format_devices_csv(&devices);
        let row = csv.lines().nth(1).unwrap_or("");
        assert!(row.contains("\"host, \"\"quoted\"\"\""));
        assert!(row.contains("\"Acme, Inc\""));
    }
}
