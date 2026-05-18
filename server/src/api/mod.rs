use crate::config::AppConfig;
use crate::static_files::serve_static_asset;
use crate::ws::hub::WsHub;
use axum::extract::State;
use axum::http::{header, Method};
use axum::{
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use sqlx::SqlitePool;
use std::sync::{Arc, LazyLock};
use std::time::Instant;
use tower_http::cors::CorsLayer;

/// Process start time, materialized on first access. Read once during router
/// construction (see build_router) so the value reflects server boot, not the
/// first /version request.
static SERVER_START: LazyLock<Instant> = LazyLock::new(Instant::now);

pub mod agents;
pub mod alert_rules;
pub mod alerts;
pub mod assets;
pub mod audit;
pub mod auth;
pub mod caddy;
pub mod cloudflare_tunnel;
pub mod config_backups;
pub mod dashboard;
pub mod ddns;
pub mod device_resolve;
pub mod devices;
pub mod dns_blocklists;
pub mod dns_logs;
pub mod dns_query_log;
pub mod dns_security;
pub mod error;
pub mod export;
pub mod mesh;
pub mod metrics;
pub mod mikrotik;
pub mod nat;
pub mod npm;
pub mod openvpn;
pub mod pfsense;
pub mod qos;
pub mod scanner;
pub mod search;
pub mod services;
pub mod settings;
pub mod setup;
pub mod snmp_management;
pub mod speedtest;
pub mod ssh_targets;
pub mod tailscale;
pub mod topology;
pub mod traffic;
pub mod unbound;
pub mod users;
pub mod vpn_status;
pub mod xiaomi;
pub mod xiaomi_mesh;

pub use error::AppError;

/// Shared application state available to all handlers.
#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub ws_hub: Arc<WsHub>,
    pub rate_limiter: auth::LoginRateLimiter,
    /// Shared reqwest::Client for Nginx Proxy Manager API.
    pub npm_http: reqwest::Client,
    /// Shared reqwest::Client for MikroTik REST API.
    pub mikrotik_http: reqwest::Client,
    /// TTL cache for MikroTik read operations.
    pub mikrotik_cache: Arc<crate::mikrotik::client::MikrotikCache>,
    /// Shared reqwest::Client for Caddy Admin API.
    pub caddy_http: reqwest::Client,
    /// Shared reqwest::Client for Xiaomi MiWiFi API.
    pub xiaomi_http: reqwest::Client,
    /// Shared reqwest::Client for Xiaomi Mesh test-connection.
    pub xiaomi_mesh_http: reqwest::Client,
    /// TTL cache for pfSense read operations.
    pub pfsense_cache: Arc<crate::pfsense::client::PfsenseCache>,
}

impl AppState {
    /// Create a new AppState with all shared resources.
    pub fn new(db: SqlitePool, config: AppConfig) -> Self {
        Self {
            db,
            config,
            ws_hub: WsHub::new(),
            rate_limiter: auth::LoginRateLimiter::new(),
            npm_http: crate::npm::client::shared_http_client(),
            mikrotik_http: crate::mikrotik::client::shared_http_client(),
            mikrotik_cache: Arc::new(crate::mikrotik::client::MikrotikCache::new()),
            caddy_http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("caddy HTTP client"),
            xiaomi_http: crate::xiaomi::client::shared_http_client(),
            xiaomi_mesh_http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("xiaomi mesh HTTP client"),
            pfsense_cache: Arc::new(crate::pfsense::client::PfsenseCache::new()),
        }
    }
}

/// Build the main application router with all API routes.
pub fn router(state: AppState) -> Router {
    // Materialize SERVER_START so uptime is measured from router construction
    // (server boot) rather than the first /version request.
    let _ = *SERVER_START;

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
        .route("/version", get(server_version))
        .route("/auth/login", post(auth::login))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/status", get(auth::status))
        .route("/auth/change-password", post(auth::change_password))
        .route("/setup", post(setup::setup));

    // Agent WebSocket + install script — authenticated via API key, not session cookie.
    let agent_ws = Router::new()
        .route("/agent/ws", get(agents::ws_handler))
        .route("/agent/install/:platform", get(agents::install_script))
        .route(
            "/agent/install/:platform/binary",
            get(agents::install_binary),
        );

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
        .route("/devices/:id/enrichment", patch(devices::update_enrichment))
        .route("/devices/:id/custom", delete(devices::reset_custom))
        .route("/devices/:id/sysinfo", get(devices::get_sysinfo))
        .route("/devices/identify", post(devices::identify_all))
        .route("/devices/resolve", post(device_resolve::resolve))
        // Agents
        .route("/agents", get(agents::list))
        .route("/agents", post(agents::register))
        .route("/agents/:id", get(agents::get_one))
        .route("/agents/:id", patch(agents::update))
        .route("/agents/:id", delete(agents::delete))
        .route("/agents/:id/reports", get(agents::list_reports))
        .route("/agents/:id/fastfetch", get(agents::get_fastfetch))
        .route("/agents/bulk-delete", post(agents::bulk_delete))
        // Dashboard
        .route("/dashboard/stats", get(dashboard::stats))
        .route(
            "/dashboard/critical-devices",
            get(dashboard::critical_devices),
        )
        .route("/dashboard/top-devices", get(dashboard::top_devices))
        // Alerts
        .route("/alerts", get(alerts::list))
        .route("/alerts", delete(alerts::delete_all))
        .route("/alerts/mark-all-read", post(alerts::mark_all_read))
        .route("/alerts/read-all", patch(alerts::mark_all_read))
        .route("/alerts/:id", delete(alerts::delete_one))
        .route("/alerts/:id/read", post(alerts::mark_read))
        .route("/alerts/:id/unread", post(alerts::mark_unread))
        .route("/alerts/:id/acknowledge", post(alerts::acknowledge))
        // Device mute
        .route("/devices/:id/mute", post(alerts::mute_device))
        // Alert rules
        .route("/alert-rules", get(alert_rules::list))
        .route("/alert-rules", post(alert_rules::create))
        .route("/alert-rules/:id", put(alert_rules::update))
        .route("/alert-rules/:id", delete(alert_rules::delete))
        // Settings
        .route("/settings", get(settings::get_settings))
        .route("/settings", patch(settings::update_settings))
        .route("/settings/test-webhook", post(settings::test_webhook))
        .route("/settings/test-email", post(settings::test_email))
        .route("/settings/netflow-status", get(settings::netflow_status))
        .route("/settings/db-size", get(settings::db_size))
        .route("/settings/vacuum", post(settings::vacuum))
        // Mesh topology (Xiaomi)
        .route("/mesh/topology", get(mesh::topology))
        // Topology
        .route("/topology/graph", get(topology::graph))
        .route("/topology/positions", get(topology::get_positions))
        .route("/topology/positions", put(topology::save_positions))
        .route("/topology/positions", delete(topology::delete_positions))
        // Scanner
        .route("/scanner/trigger", post(scanner::trigger))
        // Speed test
        .route("/router/speedtest/history", get(speedtest::history))
        // Traffic
        .route("/traffic/history", get(traffic::history))
        .route("/devices/:id/traffic", get(traffic::device_traffic))
        // Config backups
        .route("/config-backups", get(config_backups::list))
        .route("/config-backups", post(config_backups::create))
        .route("/config-backups/current", get(config_backups::show_current))
        .route("/config-backups/pending", get(config_backups::pending))
        .route("/config-backups/commit", post(config_backups::commit))
        .route("/config-backups/discard", post(config_backups::discard))
        .route("/config-backups/:id", get(config_backups::get_one))
        .route("/config-backups/:id", delete(config_backups::delete))
        .route("/config-backups/:id/diff", get(config_backups::diff))
        .route("/config-backups/:id/restore", post(config_backups::restore))
        // Nginx Proxy Manager
        .route("/npm/status", get(npm::status))
        .route("/npm/proxy-hosts", get(npm::proxy_hosts))
        .route("/npm/proxy-hosts", post(npm::create_proxy_host))
        .route("/npm/proxy-hosts/:id", put(npm::update_proxy_host))
        .route("/npm/proxy-hosts/:id", delete(npm::delete_proxy_host))
        .route("/npm/proxy-hosts/:id/toggle", post(npm::toggle_proxy_host))
        .route("/npm/redirection-hosts", get(npm::redirection_hosts))
        .route("/npm/redirection-hosts", post(npm::create_redirection_host))
        .route(
            "/npm/redirection-hosts/:id",
            put(npm::update_redirection_host),
        )
        .route(
            "/npm/redirection-hosts/:id",
            delete(npm::delete_redirection_host),
        )
        .route("/npm/certificates", get(npm::list_certificates))
        .route(
            "/npm/certificates/letsencrypt",
            post(npm::create_letsencrypt),
        )
        .route("/npm/certificates/custom", post(npm::upload_custom_cert))
        .route("/npm/certificates/:id/renew", post(npm::renew_certificate))
        .route("/npm/certificates/:id", delete(npm::delete_certificate))
        .route("/npm/streams", get(npm::list_streams))
        .route("/npm/streams", post(npm::create_stream))
        .route("/npm/streams/:id", put(npm::update_stream))
        .route("/npm/streams/:id", delete(npm::delete_stream))
        .route("/npm/streams/:id/toggle", post(npm::toggle_stream))
        .route("/npm/dead-hosts", get(npm::dead_hosts))
        .route("/npm/dead-hosts", post(npm::create_dead_host))
        .route("/npm/dead-hosts/:id", delete(npm::delete_dead_host))
        .route("/npm/access-lists", get(npm::list_access_lists))
        .route("/npm/access-lists", post(npm::create_access_list))
        .route("/npm/access-lists/:id", put(npm::update_access_list))
        .route("/npm/access-lists/:id", delete(npm::delete_access_list))
        // Caddy Reverse Proxy
        .route("/caddy/status", get(caddy::status))
        .route("/caddy/proxy-hosts", get(caddy::list))
        .route("/caddy/proxy-hosts", post(caddy::create))
        .route("/caddy/proxy-hosts/:id", put(caddy::update))
        .route("/caddy/proxy-hosts/:id", delete(caddy::delete))
        .route("/caddy/proxy-hosts/:id/toggle", post(caddy::toggle))
        .route("/caddy/sync", post(caddy::sync))
        .route("/caddy/test-connection", post(caddy::test_connection))
        // Unbound DNS
        .route("/unbound/dns-records", get(unbound::list))
        .route("/unbound/dns-records", post(unbound::create))
        .route("/unbound/dns-records/:id", put(unbound::update))
        .route("/unbound/dns-records/:id", delete(unbound::delete))
        .route("/unbound/dns-records/:id/toggle", post(unbound::toggle))
        .route("/unbound/test-connection", post(unbound::test_connection))
        // Xiaomi Mesh
        .route(
            "/xiaomi-mesh/test-connection",
            post(xiaomi_mesh::test_connection),
        )
        // Unified Services wizard
        .route("/services/add", post(services::add_service))
        .route("/services/remove", post(services::remove_service))
        // SSH targets (agentless monitoring)
        .route("/ssh-targets", get(ssh_targets::list))
        .route("/ssh-targets", post(ssh_targets::create))
        .route("/ssh-targets/:id", get(ssh_targets::get_one))
        .route("/ssh-targets/:id", put(ssh_targets::update))
        .route("/ssh-targets/:id", delete(ssh_targets::delete))
        .route("/ssh-targets/:id/reports", get(ssh_targets::list_reports))
        .route("/ssh-targets/:id/test", post(ssh_targets::test_connection))
        // MikroTik router proxy
        .route("/mikrotik/status", get(mikrotik::status))
        .route("/mikrotik/test-connection", post(mikrotik::test_connection))
        .route("/mikrotik/interfaces", get(mikrotik::interfaces))
        .route("/mikrotik/vlans", get(mikrotik::vlans))
        .route("/mikrotik/vlans", post(mikrotik::create_vlan))
        .route("/mikrotik/vlans/:id", put(mikrotik::update_vlan))
        .route("/mikrotik/vlans/:id", delete(mikrotik::delete_vlan))
        .route("/mikrotik/routes", get(mikrotik::routes))
        .route("/mikrotik/dhcp-leases", get(mikrotik::dhcp_leases))
        .route(
            "/mikrotik/dhcp-leases/:id",
            delete(mikrotik::delete_dhcp_lease),
        )
        .route(
            "/mikrotik/dhcp-static-mappings",
            post(mikrotik::create_dhcp_static_mapping),
        )
        // MikroTik DHCP server pool configuration
        .route("/mikrotik/dhcp/servers", get(mikrotik::dhcp_servers))
        .route(
            "/mikrotik/dhcp/servers/:id",
            patch(mikrotik::update_dhcp_server),
        )
        .route("/mikrotik/dhcp/networks", get(mikrotik::dhcp_networks))
        .route(
            "/mikrotik/dhcp/networks",
            post(mikrotik::create_dhcp_network),
        )
        .route(
            "/mikrotik/dhcp/networks/:id",
            patch(mikrotik::update_dhcp_network),
        )
        .route(
            "/mikrotik/dhcp/networks/:id",
            delete(mikrotik::delete_dhcp_network),
        )
        .route("/mikrotik/dhcp/pools", get(mikrotik::dhcp_pools))
        .route("/mikrotik/dhcp/pools", post(mikrotik::create_dhcp_pool))
        .route("/mikrotik/dhcp/pools/:id", put(mikrotik::update_dhcp_pool))
        .route(
            "/mikrotik/dhcp/pools/:id",
            delete(mikrotik::delete_dhcp_pool),
        )
        .route("/mikrotik/dhcp/logs", get(mikrotik::dhcp_logs))
        .route("/mikrotik/firewall", get(mikrotik::firewall))
        .route(
            "/mikrotik/firewall/filter",
            post(mikrotik::create_firewall_filter),
        )
        .route(
            "/mikrotik/firewall/filter/:id",
            patch(mikrotik::update_firewall_filter),
        )
        .route(
            "/mikrotik/firewall/filter/:id",
            delete(mikrotik::delete_firewall_filter),
        )
        .route(
            "/mikrotik/firewall/filter/:id/toggle",
            post(mikrotik::toggle_firewall_filter),
        )
        .route(
            "/mikrotik/firewall/filter/move",
            post(mikrotik::move_filter),
        )
        .route(
            "/mikrotik/firewall/nat",
            post(mikrotik::create_firewall_nat),
        )
        .route(
            "/mikrotik/firewall/nat/:id",
            patch(mikrotik::update_firewall_nat),
        )
        .route(
            "/mikrotik/firewall/nat/:id",
            delete(mikrotik::delete_firewall_nat),
        )
        .route(
            "/mikrotik/firewall/nat/:id/toggle",
            post(mikrotik::toggle_firewall_nat),
        )
        .route(
            "/mikrotik/firewall/address-list",
            post(mikrotik::create_address_list),
        )
        .route(
            "/mikrotik/firewall/address-list/:id",
            patch(mikrotik::update_address_list),
        )
        .route(
            "/mikrotik/firewall/address-list/:id",
            delete(mikrotik::delete_address_list),
        )
        .route(
            "/mikrotik/firewall/address-list/:id/toggle",
            post(mikrotik::toggle_address_list),
        )
        .route("/mikrotik/dns", get(mikrotik::dns))
        .route("/mikrotik/wireguard", get(mikrotik::wireguard))
        // MikroTik advanced routing
        .route("/mikrotik/routing/mangle", get(mikrotik::routing_mangle))
        .route("/mikrotik/routing/mangle", post(mikrotik::create_mangle))
        .route(
            "/mikrotik/routing/mangle/:id",
            delete(mikrotik::delete_mangle),
        )
        .route("/mikrotik/routing/rules", get(mikrotik::routing_rules))
        .route(
            "/mikrotik/routing/rules",
            post(mikrotik::create_routing_rule),
        )
        .route(
            "/mikrotik/routing/rules/:id",
            delete(mikrotik::delete_routing_rule),
        )
        .route("/mikrotik/routing/tables", get(mikrotik::routing_tables))
        .route(
            "/mikrotik/routing/netwatch",
            get(mikrotik::routing_netwatch),
        )
        .route(
            "/mikrotik/routing/netwatch",
            post(mikrotik::create_netwatch),
        )
        .route(
            "/mikrotik/routing/netwatch/:id",
            delete(mikrotik::delete_netwatch),
        )
        .route("/mikrotik/routing/dynamic", get(mikrotik::routing_dynamic))
        .route("/mikrotik/routing/ipv6-nd", get(mikrotik::routing_ipv6_nd))
        // Xiaomi MiWiFi
        .route("/xiaomi/status", get(xiaomi::status))
        .route("/xiaomi/topology", get(xiaomi::topology))
        .route("/xiaomi/devices", get(xiaomi::devices))
        .route("/xiaomi/new-status", get(xiaomi::new_status))
        .route("/xiaomi/wifi-devices", get(xiaomi::wifi_devices))
        .route("/xiaomi/wan-info", get(xiaomi::wan_info))
        .route("/xiaomi/lan-info", get(xiaomi::lan_info))
        .route("/xiaomi/wifi-bands", get(xiaomi::wifi_bands))
        .route("/xiaomi/firmware", get(xiaomi::firmware))
        // pfSense firewall
        .route("/pfsense/status", get(pfsense::status))
        .route("/pfsense/test-connection", post(pfsense::test_connection))
        .route("/pfsense/interfaces", get(pfsense::interfaces))
        .route(
            "/pfsense/interfaces/:id/toggle",
            post(pfsense::toggle_interface),
        )
        .route("/pfsense/gateways", get(pfsense::gateways))
        .route("/pfsense/routes", get(pfsense::routes))
        .route("/pfsense/routes", post(pfsense::create_route))
        .route("/pfsense/routes/:id", delete(pfsense::delete_route))
        .route("/pfsense/dhcp/leases", get(pfsense::dhcp_leases))
        .route(
            "/pfsense/dhcp/static-mappings",
            get(pfsense::dhcp_static_mappings),
        )
        .route(
            "/pfsense/dhcp/static-mappings",
            post(pfsense::create_dhcp_static_mapping),
        )
        .route(
            "/pfsense/dhcp/static-mappings/:id",
            delete(pfsense::delete_dhcp_static_mapping),
        )
        .route("/pfsense/firewall/rules", get(pfsense::firewall_rules))
        .route(
            "/pfsense/firewall/rules",
            post(pfsense::create_firewall_rule),
        )
        .route(
            "/pfsense/firewall/rules/:id",
            put(pfsense::update_firewall_rule),
        )
        .route(
            "/pfsense/firewall/rules/:id",
            delete(pfsense::delete_firewall_rule),
        )
        .route(
            "/pfsense/firewall/rules/:id/toggle",
            post(pfsense::toggle_firewall_rule),
        )
        .route("/pfsense/nat/rules", get(pfsense::nat_rules))
        .route("/pfsense/nat/rules", post(pfsense::create_nat_rule))
        .route("/pfsense/nat/rules/:id", put(pfsense::update_nat_rule))
        .route("/pfsense/nat/rules/:id", delete(pfsense::delete_nat_rule))
        .route("/pfsense/aliases", get(pfsense::aliases))
        .route("/pfsense/aliases", post(pfsense::create_alias))
        .route("/pfsense/aliases/:id", put(pfsense::update_alias))
        .route("/pfsense/aliases/:id", delete(pfsense::delete_alias))
        .route("/pfsense/dns/config", get(pfsense::dns_config))
        .route("/pfsense/dns/overrides", get(pfsense::dns_overrides))
        .route("/pfsense/dns/overrides", post(pfsense::create_dns_override))
        .route(
            "/pfsense/dns/overrides/:id",
            delete(pfsense::delete_dns_override),
        )
        .route("/pfsense/config-backups", get(pfsense::config_backups))
        .route(
            "/pfsense/config-backups",
            post(pfsense::create_config_backup),
        )
        .route(
            "/pfsense/config-backups/current",
            get(pfsense::config_current),
        )
        .route(
            "/pfsense/config-backups/:id/diff",
            get(pfsense::config_diff),
        )
        .route(
            "/pfsense/config-backups/:id/restore",
            post(pfsense::restore_config_backup),
        )
        .route("/pfsense/services", get(pfsense::services))
        .route(
            "/pfsense/services/:name/action",
            post(pfsense::service_action),
        )
        .route("/pfsense/audit", get(pfsense::audit_log))
        // QoS / Traffic Shaping
        .route("/qos/summary", get(qos::qos_summary))
        .route(
            "/qos/mikrotik/simple-queues",
            get(qos::mikrotik_simple_queues),
        )
        .route(
            "/qos/mikrotik/simple-queues",
            post(qos::create_mikrotik_simple_queue),
        )
        .route(
            "/qos/mikrotik/simple-queues/:id",
            put(qos::update_mikrotik_simple_queue),
        )
        .route(
            "/qos/mikrotik/simple-queues/:id",
            delete(qos::delete_mikrotik_simple_queue),
        )
        .route("/qos/mikrotik/queue-tree", get(qos::mikrotik_queue_tree))
        .route(
            "/qos/mikrotik/queue-tree",
            post(qos::create_mikrotik_queue_tree),
        )
        .route(
            "/qos/mikrotik/queue-tree/:id",
            put(qos::update_mikrotik_queue_tree),
        )
        .route(
            "/qos/mikrotik/queue-tree/:id",
            delete(qos::delete_mikrotik_queue_tree),
        )
        // VPN Status Dashboard
        .route("/vpn-status", get(vpn_status::vpn_status))
        // OpenVPN Management
        .route("/openvpn/server", get(openvpn::get_server))
        .route("/openvpn/server", put(openvpn::update_server))
        .route("/openvpn/clients", get(openvpn::list_clients))
        .route("/openvpn/certificates", get(openvpn::list_certificates))
        .route("/openvpn/export-config", get(openvpn::export_client_config))
        // Tailscale
        .route("/tailscale/status", get(tailscale::status))
        // NAT / Port Forwarding
        .route("/nat/summary", get(nat::summary))
        .route("/nat/mikrotik/rules", get(nat::mikrotik_list))
        .route("/nat/mikrotik/rules", post(nat::mikrotik_create))
        .route("/nat/mikrotik/rules/:id", put(nat::mikrotik_update))
        .route("/nat/mikrotik/rules/:id", delete(nat::mikrotik_delete))
        // Assets (IT inventory)
        .route("/assets", get(assets::list))
        .route("/assets", post(assets::create))
        .route("/assets/import", post(assets::import))
        .route("/assets/auto-link", post(assets::auto_link))
        .route("/assets/sync-from-devices", post(assets::sync_from_devices))
        .route("/assets/:id", get(assets::get_one))
        .route("/assets/:id", put(assets::update))
        .route("/assets/:id", delete(assets::delete))
        // DNS Blocklists
        .route("/dns-blocklists", get(dns_blocklists::list))
        .route("/dns-blocklists", post(dns_blocklists::create))
        .route("/dns-blocklists/stats", get(dns_blocklists::stats))
        .route(
            "/dns-blocklists/unbound-config",
            get(dns_blocklists::unbound_config),
        )
        .route(
            "/dns-blocklists/overrides",
            get(dns_blocklists::list_overrides),
        )
        .route(
            "/dns-blocklists/overrides",
            post(dns_blocklists::create_override),
        )
        .route(
            "/dns-blocklists/overrides/:id",
            delete(dns_blocklists::delete_override),
        )
        .route("/dns-blocklists/:id", put(dns_blocklists::update))
        .route("/dns-blocklists/:id", delete(dns_blocklists::delete))
        .route("/dns-blocklists/:id/toggle", post(dns_blocklists::toggle))
        .route(
            "/dns-blocklists/:id/download",
            post(dns_blocklists::download),
        )
        // DNS Security (DoT + DNSSEC)
        .route("/dns-security", get(dns_security::get_dns_security))
        .route("/dns-security", patch(dns_security::update_dns_security))
        // DNS query log
        .route("/dns-queries", get(dns_query_log::list))
        .route("/dns-queries/stats", get(dns_query_log::stats))
        .route("/dns-queries/ingest", post(dns_query_log::ingest))
        // Cloudflare Tunnel
        .route("/cloudflare-tunnel/status", get(cloudflare_tunnel::status))
        .route(
            "/cloudflare-tunnel/routes",
            get(cloudflare_tunnel::list_routes),
        )
        .route(
            "/cloudflare-tunnel/routes",
            post(cloudflare_tunnel::add_route),
        )
        .route(
            "/cloudflare-tunnel/routes/:hostname",
            delete(cloudflare_tunnel::delete_route),
        )
        .route(
            "/cloudflare-tunnel/routes/:hostname",
            put(cloudflare_tunnel::update_route),
        )
        // Dynamic DNS (DDNS) client management
        .route("/ddns", get(ddns::list))
        .route("/ddns", post(ddns::create))
        .route("/ddns/status", get(ddns::status))
        .route("/ddns/:id", put(ddns::update))
        .route("/ddns/:id", delete(ddns::delete))
        .route("/ddns/:id/toggle", post(ddns::toggle))
        // Audit log
        .route("/audit-log", get(audit::list))
        .route("/audit-log/actions", get(audit::actions))
        // DNS query log
        .route("/dns-logs", get(dns_logs::list))
        .route("/dns-logs", delete(dns_logs::purge))
        .route("/dns-logs/stats", get(dns_logs::stats))
        .route("/dns-logs/ingest", post(dns_logs::ingest))
        // Users (RBAC)
        .route("/users", get(users::list))
        .route("/users", post(users::create))
        .route("/users/:id", put(users::update))
        .route("/users/:id", delete(users::delete))
        // SNMP management
        .route("/snmp/config", get(snmp_management::get_config))
        .route("/snmp/config", patch(snmp_management::update_config))
        // Search
        .route("/search", get(search::search))
        // Export
        .route("/devices/export", get(export::devices_export))
        .route("/traffic/export", get(export::traffic_export))
        .route("/alerts/export", get(export::alerts_export))
        .route("/assets/export", get(export::assets_export))
        // WebSocket for UI live updates
        .route("/ws", get(agents::ui_ws_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            cache_invalidation,
        ))
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

/// Middleware that clears the MikroTik response cache after any
/// successful mutating request (POST / PUT / PATCH / DELETE).
async fn cache_invalidation(
    State(state): State<AppState>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    let is_mutating = !matches!(*request.method(), Method::GET);
    let response = next.run(request).await;
    if is_mutating && response.status().is_success() {
        if path.contains("/mikrotik/") {
            state.mikrotik_cache.clear();
        }
        if path.contains("/pfsense/") {
            state.pfsense_cache.clear();
        }
    }
    response
}

/// Simple health check endpoint.
async fn health() -> &'static str {
    "ok"
}

/// Returns the server binary version from Cargo.toml and process uptime.
async fn server_version() -> impl IntoResponse {
    Json(serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_seconds": SERVER_START.elapsed().as_secs(),
    }))
}
