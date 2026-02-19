use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{debug, info, warn};

use crate::collectors;
use crate::config::AgentConfig;

/// Run a single WebSocket session: connect, authenticate, then loop sending reports.
///
/// Returns Ok(()) if the server closes the connection gracefully.
/// Returns Err on connection failure or protocol errors.
pub async fn run_session(config: &AgentConfig) -> Result<()> {
    let ws_url = format!(
        "{}/api/v1/agent/ws",
        config.server_url.trim_end_matches('/')
    );

    // Build the request with auth header.
    let request = http::Request::builder()
        .uri(&ws_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Host", extract_host(&ws_url))
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header(
            "Sec-WebSocket-Key",
            tokio_tungstenite::tungstenite::handshake::client::generate_key(),
        )
        .body(())?;

    let (ws_stream, _response) = connect_async(request).await?;
    info!("WebSocket connected to {ws_url}");

    let (mut write, mut read) = ws_stream.split();

    let interval = std::time::Duration::from_secs(config.report_interval_secs);

    loop {
        // Collect system metrics.
        let report = collectors::collect_all(config);
        let json = serde_json::to_string(&report)?;
        debug!(bytes = json.len(), "Sending report");

        write.send(Message::Text(json)).await?;

        // Wait for ack or timeout before next report.
        let ack = tokio::time::timeout(std::time::Duration::from_secs(5), read.next()).await;

        match ack {
            Ok(Some(Ok(Message::Text(text)))) => {
                debug!(response = %text, "Server acknowledged");
            }
            Ok(Some(Ok(Message::Close(_)))) => {
                info!("Server closed connection");
                return Ok(());
            }
            Ok(Some(Err(e))) => {
                return Err(e.into());
            }
            Ok(None) => {
                info!("WebSocket stream ended");
                return Ok(());
            }
            Err(_) => {
                warn!("No ack received within 5s, continuing anyway");
            }
            _ => {}
        }

        tokio::time::sleep(interval).await;
    }
}

/// Extract the host portion from a URL for the Host header.
fn extract_host(url: &str) -> String {
    url.trim_start_matches("ws://")
        .trim_start_matches("wss://")
        .split('/')
        .next()
        .unwrap_or("localhost")
        .to_string()
}
