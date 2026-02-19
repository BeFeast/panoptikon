use anyhow::Result;
use clap::Parser;
use tracing::{error, info};

mod collectors;
mod config;
mod ws;

/// Panoptikon Agent — lightweight system metrics collector.
#[derive(Parser, Debug)]
#[command(name = "panoptikon-agent", version, about)]
struct Cli {
    /// Path to the configuration file.
    #[arg(short, long, default_value = "/etc/panoptikon/config.toml")]
    config: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "panoptikon_agent=info".into()),
        )
        .init();

    let cli = Cli::parse();

    info!(
        version = env!("CARGO_PKG_VERSION"),
        "Starting Panoptikon agent"
    );

    let cfg = config::AgentConfig::from_file(&cli.config)?;
    info!(
        server = %cfg.server_url,
        agent_id = %cfg.agent_id,
        interval = cfg.report_interval_secs,
        "Configuration loaded"
    );

    // Main loop: connect, report, reconnect on failure.
    let mut backoff_secs = 1u64;
    let max_backoff = 60u64;

    loop {
        info!("Connecting to server...");

        match ws::run_session(&cfg).await {
            Ok(()) => {
                info!("Session ended gracefully");
                backoff_secs = 1; // Reset backoff on clean disconnect.
            }
            Err(e) => {
                error!("Session error: {e}");
            }
        }

        info!(backoff_secs, "Reconnecting after backoff");
        tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;

        // Exponential backoff with cap.
        backoff_secs = (backoff_secs * 2).min(max_backoff);
    }
}
