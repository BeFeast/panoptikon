use anyhow::Result;
use clap::Parser;
use panoptikon_server::{api, config, db, mdns, netflow, retention, scanner};
use std::net::SocketAddr;
use tracing::info;

/// Panoptikon — VyOS router management & network monitoring server.
#[derive(Parser, Debug)]
#[command(name = "panoptikon-server", version, about)]
struct Cli {
    /// Address and port to listen on.
    #[arg(short, long, default_value = "0.0.0.0:8080")]
    listen: String,

    /// Path to the SQLite database file.
    #[arg(short, long, default_value = "panoptikon.db")]
    db: String,

    /// Path to a TOML configuration file (optional).
    #[arg(short, long)]
    config: Option<String>,
}

const BANNER: &str = r#"
  ____                        _   _ _
 |  _ \ __ _ _ __   ___  _ __ | |_(_) | _____  _ __
 | |_) / _` | '_ \ / _ \| '_ \| __| | |/ / _ \| '_ \
 |  __/ (_| | | | | (_) | |_) | |_| |   < (_) | | | |
 |_|   \__,_|_| |_|\___/| .__/ \__|_|_|\_\___/|_| |_|
                         |_|
"#;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing (logs).
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "panoptikon_server=debug,tower_http=debug".into()),
        )
        .init();

    let cli = Cli::parse();

    println!("{BANNER}");
    info!(
        version = env!("CARGO_PKG_VERSION"),
        "Starting Panoptikon server"
    );

    // Load optional config file.
    let app_config = if let Some(ref path) = cli.config {
        config::AppConfig::from_file(path)?
    } else {
        config::AppConfig::default()
    };

    // Initialize database and run migrations.
    let pool = db::init(&cli.db).await?;
    info!(path = %cli.db, "Database initialized");

    // Build shared application state (contains WsHub, session store, etc.).
    let state = api::AppState::new(pool, app_config.clone());

    // Start periodic maintenance task (every hour): purge expired sessions + stale rate-limit entries.
    {
        let cleanup_pool = state.db.clone();
        let rate_limiter = state.rate_limiter.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
            interval.tick().await; // skip the immediate first tick
            loop {
                interval.tick().await;
                match sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
                    .execute(&cleanup_pool)
                    .await
                {
                    Ok(result) => {
                        let deleted = result.rows_affected();
                        if deleted > 0 {
                            info!(deleted, "Purged expired sessions");
                        }
                    }
                    Err(e) => {
                        tracing::error!("Session cleanup failed: {e}");
                    }
                }
                rate_limiter.cleanup_stale();
            }
        });
    }

    // Start data retention background task (hourly cleanup + weekly VACUUM).
    retention::start_retention_task(state.db.clone(), app_config.retention.clone());

    // Start the periodic ARP scanner in the background.
    scanner::start_scanner_task(
        state.db.clone(),
        app_config.scanner.clone(),
        state.ws_hub.clone(),
    );

    // Start the passive mDNS/Bonjour discovery if enabled.
    if app_config.scanner.mdns_enabled {
        info!("mDNS/Bonjour passive discovery enabled");
        let mdns_pool = state.db.clone();
        let mdns_config = app_config.clone();
        tokio::spawn(async move {
            mdns::start_mdns_discovery(mdns_pool, mdns_config).await;
        });
    } else {
        info!("mDNS discovery disabled (set mdns_enabled = true in [scanner])");
    }

    // Start the NetFlow v5 UDP collector if enabled.
    if app_config.scanner.netflow_enabled {
        let port = app_config.scanner.netflow_port;
        info!(port, "Starting NetFlow v5 collector");
        netflow::start_collector(state.db.clone(), port);
    } else {
        info!("NetFlow collector disabled (set netflow_enabled = true in [scanner])");
    }

    // Build the application router.
    let app = api::router(state);

    // Start listening.
    let listener = tokio::net::TcpListener::bind(&cli.listen).await?;
    info!(addr = %cli.listen, "Listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
