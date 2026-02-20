use axum::http::{header, Method};
use axum::{
    middleware::{self},
    routing::{delete, get, patch, post},
    Router,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

use crate::config::AppConfig;
use crate::ws::hub::WsHub;

pub mod agents;
pub mod alerts;
pub mod auth;
pub mod dashboard;
pub mod devices;
pub mod settings;
pub mod traffic;
pub mod vyos;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub ws_hub: Arc<WsHub>,
    pub rate_limiter: auth::LoginRateLimiter,
}

impl AppState {
    /// Create a new AppState with all shared resources.
    pub fn new(db: SqlitePool, config: AppConfig) -> Self {
        Self {
            db,
            config,
            ws_hub: WsHub::new(),
            rate_limiter: auth::LoginRateLimiter::new(),
        }
    }
}

/// Build the main application router with all API routes.
pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE, header::COOKIE, header::AUTHORIZATION])
        .allow_credentials(true);

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
        .route("/agents/:id/reports", get(agents::list_reports))
        .route("/agents/bulk-delete", post(agents::bulk_delete))
        // Dashboard
        .route("/dashboard/stats", get(dashboard::stats))
        .route("/dashboard/top-devices", get(dashboard::top_devices))
        // Alerts
        .route("/alerts", get(alerts::list))
        .route("/alerts/:id/read", post(alerts::mark_read))
        // Settings
        .route("/settings", get(settings::get_settings))
        .route("/settings", patch(settings::update_settings))
        .route("/settings/test-webhook", post(settings::test_webhook))
        // VyOS proxy
        .route("/vyos/interfaces", get(vyos::interfaces))
        .route("/vyos/routes", get(vyos::routes))
        .route("/vyos/dhcp-leases", get(vyos::dhcp_leases))
        .route("/vyos/firewall", get(vyos::firewall))
        // Traffic
        .route("/traffic/history", get(traffic::history))
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
