use axum::{
    middleware::{self},
    routing::{delete, get, patch, post},
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

    // Public routes — no auth required.
    let public_routes = Router::new()
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/status", get(auth::status))
        .route("/auth/change-password", post(auth::change_password));

    // Agent WebSocket + install script — authenticated via API key, not session cookie.
    let agent_ws = Router::new()
        .route("/agent/ws", get(agents::ws_handler))
        .route("/agent/install/:platform", get(agents::install_script));

    // Protected routes — each method registered in its own .route() call to avoid
    // Axum 0.7 MethodRouter chaining issue where DELETE/PATCH can be dropped
    // after .layer() + .merge() in certain combinations.
    let protected_routes = Router::new()
        // Devices
        .route("/devices", get(devices::list))
        .route("/devices", post(devices::create))
        .route("/devices/:id", get(devices::get_one))
        .route("/devices/:id", patch(devices::update))
        // Agents
        .route("/agents", get(agents::list))
        .route("/agents", post(agents::register))
        .route("/agents/:id", get(agents::get_one))
        .route("/agents/:id", patch(agents::update))
        .route("/agents/:id", delete(agents::delete))
        // Dashboard
        .route("/dashboard/stats", get(dashboard::stats))
        .route("/dashboard/top-devices", get(dashboard::top_devices))
        // Alerts
        .route("/alerts", get(alerts::list))
        .route("/alerts/:id/read", post(alerts::mark_read))
        // VyOS proxy
        .route("/vyos/interfaces", get(vyos::interfaces))
        .route("/vyos/routes", get(vyos::routes))
        .route("/vyos/dhcp-leases", get(vyos::dhcp_leases))
        .route("/vyos/firewall", get(vyos::firewall))
        // WebSocket for UI live updates
        .route("/ws", get(agents::ui_ws_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Serve Next.js static export; fall back to index.html for client-side routing.
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
