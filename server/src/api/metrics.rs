//! Prometheus-compatible `/metrics` endpoint.
//!
//! Returns metrics in Prometheus text exposition format (text/plain; version=0.0.4).
//! No external crate dependency — formats the text manually.

use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};

use super::AppState;

/// GET /metrics — Prometheus scrape endpoint (no auth).
pub async fn handler(State(state): State<AppState>) -> Result<Response, StatusCode> {
    let mut out = String::with_capacity(4096);

    // ── Devices ────────────────────────────────────────────────────────
    let devices_online: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM devices WHERE is_online = 1"#)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let devices_offline: i64 =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM devices WHERE is_online = 0"#)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let devices_total: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM devices"#)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    write_gauge(
        &mut out,
        "panoptikon_devices_online_total",
        "Number of devices currently online",
        devices_online,
    );
    write_gauge(
        &mut out,
        "panoptikon_devices_offline_total",
        "Number of devices currently offline",
        devices_offline,
    );
    write_gauge(
        &mut out,
        "panoptikon_devices_total",
        "Total number of discovered devices",
        devices_total,
    );

    // ── Agents ─────────────────────────────────────────────────────────
    let agents_online: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM agents WHERE last_report_at > datetime('now', '-120 seconds')"#,
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    write_gauge(
        &mut out,
        "panoptikon_agents_online_total",
        "Number of agents seen in the last 120 seconds",
        agents_online,
    );

    // ── Alerts by severity × status ────────────────────────────────────
    let alert_rows: Vec<(String, String, i64)> = sqlx::query_as(
        r#"SELECT
             severity,
             CASE WHEN acknowledged_at IS NOT NULL THEN 'acknowledged' ELSE 'active' END AS status,
             COUNT(*) AS cnt
           FROM alerts
           GROUP BY severity, status"#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    out.push_str("# HELP panoptikon_alerts_total Number of alerts by severity and status\n");
    out.push_str("# TYPE panoptikon_alerts_total gauge\n");

    // Ensure we emit all expected label combos (even if zero).
    for severity in &["INFO", "WARNING", "CRITICAL"] {
        for status in &["active", "acknowledged"] {
            let count = alert_rows
                .iter()
                .find(|(s, st, _)| s == severity && st == status)
                .map(|(_, _, c)| *c)
                .unwrap_or(0);
            out.push_str(&format!(
                "panoptikon_alerts_total{{severity=\"{severity}\",status=\"{status}\"}} {count}\n"
            ));
        }
    }

    // ── Traffic per device (latest sample) ─────────────────────────────
    let traffic_rows: Vec<(String, Option<String>, i64, i64)> = sqlx::query_as(
        r#"SELECT ts.device_id, di.ip, ts.rx_bps, ts.tx_bps
           FROM traffic_samples ts
           INNER JOIN (
               SELECT device_id, MAX(sampled_at) AS max_at
               FROM traffic_samples
               GROUP BY device_id
           ) latest ON ts.device_id = latest.device_id AND ts.sampled_at = latest.max_at
           LEFT JOIN device_ips di ON di.device_id = ts.device_id AND di.is_current = 1"#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if !traffic_rows.is_empty() {
        out.push_str(
            "# HELP panoptikon_traffic_rx_bps Received traffic in bits per second per device\n",
        );
        out.push_str("# TYPE panoptikon_traffic_rx_bps gauge\n");
        for (device_id, ip, rx_bps, _) in &traffic_rows {
            let ip_label = ip.as_deref().unwrap_or("");
            out.push_str(&format!(
                "panoptikon_traffic_rx_bps{{device_id=\"{device_id}\",ip=\"{ip_label}\"}} {rx_bps}\n"
            ));
        }

        out.push_str(
            "# HELP panoptikon_traffic_tx_bps Transmitted traffic in bits per second per device\n",
        );
        out.push_str("# TYPE panoptikon_traffic_tx_bps gauge\n");
        for (device_id, ip, _, tx_bps) in &traffic_rows {
            let ip_label = ip.as_deref().unwrap_or("");
            out.push_str(&format!(
                "panoptikon_traffic_tx_bps{{device_id=\"{device_id}\",ip=\"{ip_label}\"}} {tx_bps}\n"
            ));
        }
    }

    // ── NetFlow flows received (counter) ───────────────────────────────
    let flows = crate::netflow::flows_received();

    out.push_str(
        "# HELP panoptikon_netflow_flows_received_total Total NetFlow v5 flow records received\n",
    );
    out.push_str("# TYPE panoptikon_netflow_flows_received_total counter\n");
    out.push_str(&format!(
        "panoptikon_netflow_flows_received_total {flows}\n"
    ));

    Ok((
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        out,
    )
        .into_response())
}

/// Write a simple gauge metric (HELP + TYPE + value line).
fn write_gauge(out: &mut String, name: &str, help: &str, value: i64) {
    out.push_str(&format!("# HELP {name} {help}\n"));
    out.push_str(&format!("# TYPE {name} gauge\n"));
    out.push_str(&format!("{name} {value}\n"));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a fresh in-memory database with all migrations.
    async fn test_db() -> sqlx::SqlitePool {
        crate::db::init(":memory:")
            .await
            .expect("in-memory DB init failed")
    }

    /// Helper: build an AppState with an in-memory database.
    async fn test_state() -> AppState {
        let pool = test_db().await;
        AppState::new(pool, crate::config::AppConfig::default())
    }

    /// Extract the body text from the metrics handler response.
    async fn get_metrics_body(state: &AppState) -> String {
        let resp = handler(State(state.clone())).await.expect("handler failed");
        let body_bytes = axum::body::to_bytes(resp.into_body(), 1_000_000)
            .await
            .expect("body read failed");
        String::from_utf8(body_bytes.to_vec()).expect("body is not utf-8")
    }

    #[tokio::test]
    async fn test_metrics_format_valid() {
        let state = test_state().await;
        let body = get_metrics_body(&state).await;

        // Must contain HELP and TYPE lines.
        assert!(body.contains("# HELP"), "should contain # HELP lines");
        assert!(body.contains("# TYPE"), "should contain # TYPE lines");

        // Must contain expected metric names.
        assert!(body.contains("panoptikon_devices_online_total"));
        assert!(body.contains("panoptikon_devices_offline_total"));
        assert!(body.contains("panoptikon_devices_total"));
        assert!(body.contains("panoptikon_agents_online_total"));
        assert!(body.contains("panoptikon_alerts_total"));
        assert!(body.contains("panoptikon_netflow_flows_received_total"));

        // HELP/TYPE for each gauge.
        assert!(body.contains("# TYPE panoptikon_devices_online_total gauge"));
        assert!(body.contains("# TYPE panoptikon_devices_total gauge"));
        assert!(body.contains("# TYPE panoptikon_agents_online_total gauge"));
        assert!(body.contains("# TYPE panoptikon_alerts_total gauge"));
        assert!(body.contains("# TYPE panoptikon_netflow_flows_received_total counter"));
    }

    #[tokio::test]
    async fn test_metrics_devices_count() {
        let state = test_state().await;

        // Insert 2 devices (both online by default).
        for mac in &["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"] {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                r#"INSERT INTO devices (id, mac, name, first_seen_at, last_seen_at, is_online)
                   VALUES (?, ?, 'test', datetime('now'), datetime('now'), 1)"#,
            )
            .bind(&id)
            .bind(mac)
            .execute(&state.db)
            .await
            .unwrap();
        }

        let body = get_metrics_body(&state).await;

        // panoptikon_devices_total should be 2.
        assert!(
            body.contains("panoptikon_devices_total 2"),
            "Expected devices_total 2, got:\n{body}"
        );
    }

    #[tokio::test]
    async fn test_metrics_online_offline_split() {
        let state = test_state().await;

        // Insert 1 online device.
        let id1 = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, first_seen_at, last_seen_at, is_online)
               VALUES (?, 'AA:BB:CC:DD:EE:10', 'online-dev', datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&id1)
        .execute(&state.db)
        .await
        .unwrap();

        // Insert 1 offline device.
        let id2 = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, first_seen_at, last_seen_at, is_online)
               VALUES (?, 'AA:BB:CC:DD:EE:11', 'offline-dev', datetime('now'), datetime('now'), 0)"#,
        )
        .bind(&id2)
        .execute(&state.db)
        .await
        .unwrap();

        let body = get_metrics_body(&state).await;

        assert!(
            body.contains("panoptikon_devices_online_total 1"),
            "Expected online=1, got:\n{body}"
        );
        assert!(
            body.contains("panoptikon_devices_offline_total 1"),
            "Expected offline=1, got:\n{body}"
        );
        assert!(
            body.contains("panoptikon_devices_total 2"),
            "Expected total=2, got:\n{body}"
        );
    }
}
