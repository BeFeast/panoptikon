use crate::config::AppConfig;
use crate::static_files::serve_static_asset;
use crate::ws::hub::WsHub;
use axum::http::{header, Method};
use axum::{
    middleware::{self},
    routing::{delete, get, patch, post, put},
    Router,
};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

pub mod agents;
pub mod alerts;
pub mod audit;
pub mod auth;
pub mod dashboard;
pub mod devices;
pub mod error;
pub mod export;
pub mod metrics;
pub mod scanner;
pub mod search;
pub mod settings;
pub mod setup;
pub mod topology;
pub mod traffic;
pub mod vyos;

pub use error::AppError;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub ws_hub: Arc<WsHub>,
    pub rate_limiter: auth::LoginRateLimiter,
    pub last_speedtest: Arc<Mutex<Option<vyos::SpeedTestResult>>>,
}

impl AppState {
    /// Create a new AppState with all shared resources.
    pub fn new(db: SqlitePool, config: AppConfig) -> Self {
        Self {
            db,
            config,
            ws_hub: WsHub::new(),
            rate_limiter: auth::LoginRateLimiter::new(),
            last_speedtest: Arc::new(Mutex::new(None)),
        }
    }
}

/// Build the main application router with all API routes.
pub fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::AllowOrigin::mirror_request())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, header::COOKIE, header::AUTHORIZATION])
        .allow_credentials(true);

    // Public routes — no auth required.
    let public_routes = Router::new()
        .route("/health", get(health))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/status", get(auth::status))
        .route("/auth/change-password", post(auth::change_password))
        .route("/setup", post(setup::setup));

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
        .route("/devices/:id/events", get(devices::events))
        .route("/devices/:id/uptime", get(devices::uptime))
        .route("/devices/:id/wake", post(devices::wake))
        .route("/devices/:id/scan", get(devices::get_scan))
        .route("/devices/:id/scan", post(devices::trigger_scan))
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
        .route("/alerts", delete(alerts::delete_all))
        .route("/alerts/mark-all-read", post(alerts::mark_all_read))
        .route("/alerts/read-all", patch(alerts::mark_all_read))
        .route("/alerts/:id", delete(alerts::delete_one))
        .route("/alerts/:id/read", post(alerts::mark_read))
        .route("/alerts/:id/acknowledge", post(alerts::acknowledge))
        // Device mute
        .route("/devices/:id/mute", post(alerts::mute_device))
        // Settings
        .route("/settings", get(settings::get_settings))
        .route("/settings", patch(settings::update_settings))
        .route("/settings/test-webhook", post(settings::test_webhook))
        .route("/settings/netflow-status", get(settings::netflow_status))
        .route("/settings/db-size", get(settings::db_size))
        .route("/settings/vacuum", post(settings::vacuum))
        // VyOS router proxy
        .route("/vyos/status", get(vyos::status))
        .route("/vyos/interfaces", get(vyos::interfaces))
        .route("/vyos/config-interfaces", get(vyos::config_interfaces))
        .route("/vyos/routes", get(vyos::routes))
        .route("/vyos/dhcp-leases", get(vyos::dhcp_leases))
        .route("/vyos/firewall", get(vyos::firewall))
        // VyOS write operations
        .route(
            "/vyos/interfaces/:name/toggle",
            post(vyos::interface_toggle),
        )
        .route(
            "/vyos/dhcp/static-mappings",
            get(vyos::dhcp_static_mappings),
        )
        .route(
            "/vyos/dhcp/static-mappings",
            post(vyos::create_dhcp_static_mapping),
        )
        .route(
            "/vyos/dhcp/static-mappings/:network/:subnet/:name",
            delete(vyos::delete_dhcp_static_mapping),
        )
        // Firewall write operations
        .route(
            "/vyos/firewall/:chain/rules",
            post(vyos::create_firewall_rule),
        )
        .route(
            "/vyos/firewall/:chain/rules/:number",
            put(vyos::update_firewall_rule),
        )
        .route(
            "/vyos/firewall/:chain/rules/:number",
            delete(vyos::delete_firewall_rule),
        )
        .route(
            "/vyos/firewall/:chain/rules/:number/enabled",
            patch(vyos::toggle_firewall_rule),
        )
        // Firewall groups
        .route("/vyos/firewall/groups", get(vyos::firewall_groups))
        .route(
            "/vyos/firewall/groups/address-group",
            post(vyos::create_address_group),
        )
        .route(
            "/vyos/firewall/groups/address-group/:name",
            delete(vyos::delete_address_group),
        )
        .route(
            "/vyos/firewall/groups/address-group/:name/members",
            post(vyos::add_address_group_member),
        )
        .route(
            "/vyos/firewall/groups/address-group/:name/members/:value",
            delete(vyos::remove_address_group_member),
        )
        .route(
            "/vyos/firewall/groups/network-group",
            post(vyos::create_network_group),
        )
        .route(
            "/vyos/firewall/groups/network-group/:name",
            delete(vyos::delete_network_group),
        )
        .route(
            "/vyos/firewall/groups/network-group/:name/members",
            post(vyos::add_network_group_member),
        )
        .route(
            "/vyos/firewall/groups/network-group/:name/members/:value",
            delete(vyos::remove_network_group_member),
        )
        .route(
            "/vyos/firewall/groups/port-group",
            post(vyos::create_port_group),
        )
        .route(
            "/vyos/firewall/groups/port-group/:name",
            delete(vyos::delete_port_group),
        )
        .route(
            "/vyos/firewall/groups/port-group/:name/members",
            post(vyos::add_port_group_member),
        )
        .route(
            "/vyos/firewall/groups/port-group/:name/members/:value",
            delete(vyos::remove_port_group_member),
        )
        // Topology positions
        .route("/topology/positions", get(topology::get_positions))
        .route("/topology/positions", put(topology::save_positions))
        .route("/topology/positions", delete(topology::delete_positions))
        // Scanner
        .route("/scanner/trigger", post(scanner::trigger))
        // Speed test
        .route("/router/speedtest", post(vyos::speedtest))
        // Traffic
        .route("/traffic/history", get(traffic::history))
        // Audit log
        .route("/audit-log", get(audit::list))
        .route("/audit-log/actions", get(audit::actions))
        // Search
        .route("/search", get(search::search))
        // Export
        .route("/devices/export", get(export::devices_export))
        .route("/traffic/export", get(export::traffic_export))
        // WebSocket for UI live updates
        .route("/ws", get(agents::ui_ws_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth::auth_middleware,
        ));

    // Prometheus metrics endpoint — outside /api/v1 and outside auth.
    let metrics_route = Router::new().route("/metrics", get(metrics::handler));

    Router::new()
        .merge(metrics_route)
        .nest(
            "/api/v1",
            public_routes.merge(agent_ws).merge(protected_routes),
        )
        .fallback(serve_static_asset)
        .layer(cors)
        .with_state(state)
}

/// Simple health check endpoint.
async fn health() -> &'static str {
    "ok"
}
