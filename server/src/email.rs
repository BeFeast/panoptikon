use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde_json::Value;
use sqlx::SqlitePool;
use tracing::{info, warn};

/// SMTP configuration read from the settings table.
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub to_email: String,
    pub tls_enabled: bool,
}

/// Read SMTP configuration from the settings table. Returns `None` if not fully configured.
pub async fn get_smtp_config(db: &SqlitePool) -> Option<SmtpConfig> {
    let host = get_setting(db, "smtp_host").await?;
    let port: u16 = get_setting(db, "smtp_port")
        .await
        .and_then(|v| v.parse().ok())
        .unwrap_or(587);
    let username = get_setting(db, "smtp_username").await.unwrap_or_default();
    let password = get_setting(db, "smtp_password").await.unwrap_or_default();
    let from_email = get_setting(db, "smtp_from_email").await?;
    let to_email = get_setting(db, "smtp_to_email").await?;
    let tls_enabled = get_setting(db, "smtp_tls_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(true);

    Some(SmtpConfig {
        host,
        port,
        username,
        password,
        from_email,
        to_email,
        tls_enabled,
    })
}

async fn get_setting(db: &SqlitePool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

/// Format a human-readable email body from the alert type and data.
fn format_email_body(alert_type: &str, data: &Value) -> String {
    let mac = data["mac"].as_str().unwrap_or("unknown");
    let ip = data["ip"].as_str().unwrap_or("");

    match alert_type {
        "new_device" => {
            let vendor = data["vendor"].as_str().unwrap_or("Unknown");
            format!(
                "A new device has been discovered on your network.\n\n\
                 MAC: {mac}\n\
                 IP: {ip}\n\
                 Vendor: {vendor}\n\n\
                 — Panoptikon"
            )
        }
        "device_online" => format!("Device {mac} ({ip}) came back online.\n\n— Panoptikon"),
        "device_offline" => format!("Device {mac} went offline.\n\n— Panoptikon"),
        "agent_offline" => {
            let name = data["name"].as_str().unwrap_or(mac);
            format!("Agent {name} went offline.\n\n— Panoptikon")
        }
        "test" => data["message"]
            .as_str()
            .unwrap_or("Panoptikon email test — if you see this, email alerts are working!")
            .to_string(),
        _ => format!("Alert: {alert_type}\n\n— Panoptikon"),
    }
}

/// Human-readable subject line for an alert type.
fn email_subject(alert_type: &str) -> String {
    let label = match alert_type {
        "new_device" => "New Device Discovered",
        "device_online" => "Device Online",
        "device_offline" => "Device Offline",
        "agent_offline" => "Agent Offline",
        "high_bandwidth" => "High Bandwidth Alert",
        "test" => "Test Email",
        _ => alert_type,
    };
    format!("[Panoptikon] {label}")
}

/// Send an alert email using the stored SMTP settings.
pub async fn send_alert_email(config: &SmtpConfig, alert_type: &str, data: &Value) {
    let subject = email_subject(alert_type);
    let body = format_email_body(alert_type, data);

    let email = match Message::builder()
        .from(
            config
                .from_email
                .parse()
                .unwrap_or_else(|_| "panoptikon@localhost".parse().unwrap()),
        )
        .to(config
            .to_email
            .parse()
            .unwrap_or_else(|_| "admin@localhost".parse().unwrap()))
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body)
    {
        Ok(m) => m,
        Err(e) => {
            warn!(error = %e, "Failed to build email message");
            return;
        }
    };

    let transport_result = if config.tls_enabled {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host).map(|builder| {
            builder
                .port(config.port)
                .credentials(Credentials::new(
                    config.username.clone(),
                    config.password.clone(),
                ))
                .build()
        })
    } else {
        Ok(
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
                .port(config.port)
                .credentials(Credentials::new(
                    config.username.clone(),
                    config.password.clone(),
                ))
                .build(),
        )
    };

    let mailer = match transport_result {
        Ok(m) => m,
        Err(e) => {
            warn!(error = %e, "Failed to create SMTP transport");
            return;
        }
    };

    match mailer.send(email).await {
        Ok(_) => info!("Alert email sent successfully"),
        Err(e) => warn!(error = %e, "Failed to send alert email"),
    }
}

/// Non-blocking email dispatch. Reads SMTP config from DB and sends if configured.
pub fn dispatch_email(db: &SqlitePool, alert_type: &str, data: Value) {
    let db = db.clone();
    let alert_type = alert_type.to_string();

    tokio::spawn(async move {
        if let Some(config) = get_smtp_config(&db).await {
            send_alert_email(&config, &alert_type, &data).await;
        }
    });
}
