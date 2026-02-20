use serde_json::Value;
use sqlx::SqlitePool;
use std::time::Duration;
use tracing::warn;

/// Read the webhook_url from the settings table. Returns `None` if not set or empty.
pub async fn get_webhook_url(db: &SqlitePool) -> Option<String> {
    let row: Option<(String,)> =
        sqlx::query_as(r#"SELECT value FROM settings WHERE key = 'webhook_url'"#)
            .fetch_optional(db)
            .await
            .ok()?;

    row.and_then(|(v,)| if v.is_empty() { None } else { Some(v) })
}

/// POST a JSON payload to the given webhook URL.
///
/// Times out after 5 seconds. Logs a warning on error but never panics.
pub async fn send_webhook(url: &str, payload: Value) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "Failed to build reqwest client for webhook");
            return;
        }
    };

    match client.post(url).json(&payload).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                warn!(
                    url = %url,
                    status = %resp.status(),
                    "Webhook POST returned non-success status"
                );
            }
        }
        Err(e) => {
            warn!(url = %url, error = %e, "Webhook POST failed");
        }
    }
}

/// Check the settings table for a webhook URL and, if set, fire off a non-blocking
/// POST with the given alert payload. This never blocks the caller.
pub fn dispatch_webhook(db: &SqlitePool, alert_type: &str, payload: Value) {
    let db = db.clone();
    let alert_type = alert_type.to_string();

    tokio::spawn(async move {
        if let Some(url) = get_webhook_url(&db).await {
            let webhook_payload = serde_json::json!({
                "type": alert_type,
                "data": payload,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            });
            send_webhook(&url, webhook_payload).await;
        }
    });
}
