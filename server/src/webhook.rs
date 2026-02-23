use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::time::Duration;
use tracing::{info, warn};

/// Detected webhook service format.
enum WebhookFormat {
    /// Discord webhook — expects `{"content": "..."}`.
    Discord,
    /// ntfy.sh — accepts plain text body with `Title` header.
    Ntfy,
    /// Telegram Bot API — expects `{"chat_id": "...", "text": "..."}`.
    Telegram,
    /// Generic JSON — sends structured `{type, message, data, timestamp}`.
    Generic,
}

/// Auto-detect the webhook service from the URL.
fn detect_format(url: &str) -> WebhookFormat {
    if url.contains("discord.com/api/webhooks") || url.contains("discordapp.com/api/webhooks") {
        WebhookFormat::Discord
    } else if url.contains("ntfy.sh/") || url.contains("ntfy.") {
        WebhookFormat::Ntfy
    } else if url.contains("api.telegram.org/bot") {
        WebhookFormat::Telegram
    } else {
        WebhookFormat::Generic
    }
}

/// Create a human-readable message from the alert type and data payload.
fn format_alert_message(alert_type: &str, data: &Value) -> String {
    let mac = data["mac"].as_str().unwrap_or("unknown");
    let ip = data["ip"].as_str().unwrap_or("");
    let vendor = data["vendor"].as_str().unwrap_or("");

    match alert_type {
        "new_device" => {
            if vendor.is_empty() || vendor == "Unknown" {
                format!("New device discovered: {mac} ({ip})")
            } else {
                format!("New device discovered: {mac} ({ip}) — {vendor}")
            }
        }
        "device_online" => format!("Device {mac} ({ip}) came back online"),
        "device_offline" => format!("Device {mac} went offline"),
        "agent_offline" => {
            let name = data["name"].as_str().unwrap_or(mac);
            format!("Agent {name} went offline")
        }
        "test" => data["message"]
            .as_str()
            .unwrap_or("Panoptikon webhook test")
            .to_string(),
        _ => format!("Alert: {alert_type}"),
    }
}

/// Human-readable title for an alert type.
fn humanize_alert_type(alert_type: &str) -> &str {
    match alert_type {
        "new_device" => "New Device",
        "device_online" => "Device Online",
        "device_offline" => "Device Offline",
        "agent_offline" => "Agent Offline",
        "high_bandwidth" => "High Bandwidth",
        "test" => "Test",
        _ => alert_type,
    }
}

/// Map alert type to ntfy priority (1-5).
fn ntfy_priority(alert_type: &str) -> &str {
    match alert_type {
        "device_offline" | "agent_offline" => "4",
        "new_device" | "high_bandwidth" => "3",
        "device_online" | "test" => "3",
        _ => "3",
    }
}

/// Map alert type to ntfy tags (emoji shortcodes).
fn ntfy_tags(alert_type: &str) -> &str {
    match alert_type {
        "new_device" => "new",
        "device_online" => "white_check_mark",
        "device_offline" => "warning",
        "agent_offline" => "rotating_light",
        "high_bandwidth" => "chart_with_upwards_trend",
        "test" => "bell",
        _ => "bell",
    }
}

/// Read the webhook_url from the settings table. Returns `None` if not set or empty.
pub async fn get_webhook_url(db: &SqlitePool) -> Option<String> {
    let row: Option<(String,)> =
        sqlx::query_as(r#"SELECT value FROM settings WHERE key = 'webhook_url'"#)
            .fetch_optional(db)
            .await
            .ok()?;

    row.and_then(|(v,)| if v.is_empty() { None } else { Some(v) })
}

/// Send an alert webhook, auto-detecting the service format from the URL.
///
/// Supports Discord webhooks, ntfy.sh, Telegram Bot API, and generic JSON.
/// Times out after 5 seconds. Logs a warning on error but never panics.
pub async fn send_alert_webhook(url: &str, alert_type: &str, data: &Value) {
    let format = detect_format(url);
    let message = format_alert_message(alert_type, data);
    let title = humanize_alert_type(alert_type);

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

    let result = match format {
        WebhookFormat::Discord => {
            info!(url = %url, "Sending Discord-formatted webhook");
            let payload = json!({ "content": format!("**{title}** — {message}") });
            client.post(url).json(&payload).send().await
        }
        WebhookFormat::Ntfy => {
            info!(url = %url, "Sending ntfy-formatted webhook");
            client
                .post(url)
                .header("Title", format!("Panoptikon: {title}"))
                .header("Priority", ntfy_priority(alert_type))
                .header("Tags", ntfy_tags(alert_type))
                .body(message)
                .send()
                .await
        }
        WebhookFormat::Telegram => {
            // Extract chat_id from settings or data; for Telegram the URL itself
            // is the full API endpoint (e.g. https://api.telegram.org/bot<token>/sendMessage)
            // and the user must include chat_id in the configured URL as a query param
            // or we read it from a separate setting.
            info!(url = %url, "Sending Telegram-formatted webhook");
            let payload = json!({
                "text": format!("{title}\n{message}"),
                "parse_mode": "HTML",
            });
            client.post(url).json(&payload).send().await
        }
        WebhookFormat::Generic => {
            let payload = json!({
                "type": alert_type,
                "title": title,
                "message": message,
                "data": data,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            });
            client.post(url).json(&payload).send().await
        }
    };

    match result {
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
///
/// Auto-detects the webhook service (Discord, ntfy.sh, Telegram) from the URL
/// and formats the payload accordingly.
pub fn dispatch_webhook(db: &SqlitePool, alert_type: &str, data: Value) {
    let db = db.clone();
    let alert_type = alert_type.to_string();

    tokio::spawn(async move {
        if let Some(url) = get_webhook_url(&db).await {
            send_alert_webhook(&url, &alert_type, &data).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_format_discord() {
        assert!(matches!(
            detect_format("https://discord.com/api/webhooks/1234/abcdef"),
            WebhookFormat::Discord
        ));
        assert!(matches!(
            detect_format("https://discordapp.com/api/webhooks/1234/abcdef"),
            WebhookFormat::Discord
        ));
    }

    #[test]
    fn test_detect_format_ntfy() {
        assert!(matches!(
            detect_format("https://ntfy.sh/my-topic"),
            WebhookFormat::Ntfy
        ));
        assert!(matches!(
            detect_format("https://ntfy.example.com/alerts"),
            WebhookFormat::Ntfy
        ));
    }

    #[test]
    fn test_detect_format_telegram() {
        assert!(matches!(
            detect_format("https://api.telegram.org/bot123456:ABC-DEF/sendMessage"),
            WebhookFormat::Telegram
        ));
    }

    #[test]
    fn test_detect_format_generic() {
        assert!(matches!(
            detect_format("https://example.com/webhook"),
            WebhookFormat::Generic
        ));
    }

    #[test]
    fn test_format_alert_message_new_device() {
        let data = json!({"mac": "aa:bb:cc:dd:ee:ff", "ip": "10.0.0.1", "vendor": "Apple"});
        let msg = format_alert_message("new_device", &data);
        assert_eq!(
            msg,
            "New device discovered: aa:bb:cc:dd:ee:ff (10.0.0.1) — Apple"
        );
    }

    #[test]
    fn test_format_alert_message_new_device_unknown_vendor() {
        let data = json!({"mac": "aa:bb:cc:dd:ee:ff", "ip": "10.0.0.1", "vendor": "Unknown"});
        let msg = format_alert_message("new_device", &data);
        assert_eq!(msg, "New device discovered: aa:bb:cc:dd:ee:ff (10.0.0.1)");
    }

    #[test]
    fn test_format_alert_message_device_online() {
        let data = json!({"mac": "aa:bb:cc:dd:ee:ff", "ip": "10.0.0.1"});
        let msg = format_alert_message("device_online", &data);
        assert_eq!(msg, "Device aa:bb:cc:dd:ee:ff (10.0.0.1) came back online");
    }

    #[test]
    fn test_format_alert_message_device_offline() {
        let data = json!({"mac": "aa:bb:cc:dd:ee:ff"});
        let msg = format_alert_message("device_offline", &data);
        assert_eq!(msg, "Device aa:bb:cc:dd:ee:ff went offline");
    }

    #[test]
    fn test_format_alert_message_test() {
        let data = json!({"message": "Hello from Panoptikon"});
        let msg = format_alert_message("test", &data);
        assert_eq!(msg, "Hello from Panoptikon");
    }
}
