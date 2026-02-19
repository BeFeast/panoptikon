use axum::{
    routing::{get, post},
    Router,
};
use sqlx::SqlitePool;
use tower_http::cors::{Any, CorsLayer};

use crate::config::AppConfig;

pub mod agents;
pub mod alerts;
pub mod auth;
pub mod devices;
pub mod vyos;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
}

/// Build the main application router with all API routes.
pub fn router(db: SqlitePool, config: AppConfig) -> Router {
    let state = AppState { db, config };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_v1 = Router::new()
        // Health check
        .route("/health", get(health))
        // Device endpoints
        .route("/devices", get(devices::list).post(devices::create))
        .route("/devices/{id}", get(devices::get_one).patch(devices::update))
        // Agent endpoints
        .route("/agents", get(agents::list).post(agents::register))
        .route("/agents/{id}", get(agents::get_one))
        .route("/agent/ws", get(agents::ws_handler))
        // Alert endpoints
        .route("/alerts", get(alerts::list))
        .route("/alerts/{id}/read", post(alerts::mark_read))
        // VyOS proxy endpoints
        .route("/vyos/interfaces", get(vyos::interfaces))
        .route("/vyos/routes", get(vyos::routes))
        .route("/vyos/dhcp-leases", get(vyos::dhcp_leases))
        .route("/vyos/firewall", get(vyos::firewall))
        // Auth endpoints
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout));

    Router::new()
        .nest("/api/v1", api_v1)
        .layer(cors)
        .with_state(state)
}

/// Simple health check endpoint.
async fn health() -> &'static str {
    "ok"
}
