use axum::{
    middleware::{self},
    routing::{get, post},
    Router,
};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::config::AppConfig;
use crate::ws::hub::WsHub;

pub mod agents;
pub mod alerts;
pub mod auth;
pub mod dashboard;
pub mod devices;
pub mod vyos;

/// Session entry: maps token → expiry time.
pub type SessionStore = Arc<RwLock<HashMap<String, chrono::DateTime<chrono::Utc>>>>;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub sessions: SessionStore,
    pub ws_hub: Arc<WsHub>,
}

impl AppState {
    /// Create a new AppState with all shared resources.
    pub fn new(db: SqlitePool, config: AppConfig) -> Self {
        Self {
            db,
            config,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            ws_hub: WsHub::new(),
        }
    }
}

/// Build the main application router with all API routes.
pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Routes that do NOT require auth
    let public_routes = Router::new()
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/status", get(auth::status))
        .route("/auth/change-password", post(auth::change_password));

    // Routes that require auth
    let protected_routes = Router::new()
        // Device endpoints
        .route("/devices", get(devices::list).post(devices::create))
        .route(
            "/devices/{id}",
            get(devices::get_one).patch(devices::update),
        )
        // Agent endpoints
        .route("/agents", get(agents::list).post(agents::register))
        .route(
            "/agents/{id}",
            get(agents::get_one)
                .patch(agents::update)
                .delete(agents::delete),
        )
        // Dashboard endpoints
        .route("/dashboard/stats", get(dashboard::stats))
        .route("/dashboard/top-devices", get(dashboard::top_devices))
        // Alert endpoints
        .route("/alerts", get(alerts::list))
        .route("/alerts/{id}/read", post(alerts::mark_read))
        // VyOS proxy endpoints
        .route("/vyos/interfaces", get(vyos::interfaces))
        .route("/vyos/routes", get(vyos::routes))
        .route("/vyos/dhcp-leases", get(vyos::dhcp_leases))
        .route("/vyos/firewall", get(vyos::firewall))
        // WebSocket for UI live updates
        .route("/ws", get(agents::ui_ws_handler))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Agent WebSocket + install script — use API key auth, not session cookies
    let agent_ws = Router::new()
        .route("/agent/ws", get(agents::ws_handler))
        .route("/agent/install/:platform", get(agents::install_script));

    // Serve Next.js static export from ../web/out (dev) or ./web (embedded later).
    // Falls back to index.html for client-side routing (SPA behaviour).
    let web_dir = std::env::current_dir().unwrap_or_default().join("web/out");
    let serve_dir =
        ServeDir::new(&web_dir).not_found_service(ServeFile::new(web_dir.join("index.html")));

    Router::new()
        .nest(
            "/api/v1",
            public_routes.merge(agent_ws).merge(protected_routes),
        )
        .fallback_service(serve_dir)
        .layer(cors)
        .with_state(state)
}

/// Simple health check endpoint.
async fn health() -> &'static str {
    "ok"
}
