use anyhow::Result;
use serde::Deserialize;

/// Top-level configuration loaded from a TOML file or defaults.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AppConfig {
    /// Address and port to listen on.
    #[serde(default = "default_listen")]
    pub listen: Option<String>,

    /// Path to the SQLite database file.
    #[serde(default)]
    pub db_path: Option<String>,

    /// VyOS section.
    #[serde(default)]
    pub vyos: VyosConfig,

    /// Scanner section.
    #[serde(default)]
    pub scanner: ScannerConfig,

    /// Auth section.
    #[serde(default)]
    pub auth: AuthConfig,

    /// Retention section — data cleanup periods.
    #[serde(default)]
    pub retention: RetentionConfig,
}

fn default_listen() -> Option<String> {
    Some("0.0.0.0:8080".to_string())
}

/// VyOS router connection settings.
#[derive(Debug, Clone, Default, Deserialize)]
#[allow(dead_code)]
pub struct VyosConfig {
    /// VyOS HTTP API URL (e.g., "https://192.168.1.1").
    pub url: Option<String>,

    /// VyOS HTTP API key.
    pub api_key: Option<String>,

    /// Accept self-signed TLS certificates.
    #[serde(default)]
    pub insecure_tls: bool,
}

/// ARP scanner settings.
#[derive(Debug, Clone, Deserialize)]
pub struct ScannerConfig {
    /// Subnets to scan (CIDR notation).
    #[serde(default)]
    pub subnets: Vec<String>,

    /// How often to run the ARP scan, in seconds.
    #[serde(default = "default_scan_interval")]
    pub interval_seconds: u64,

    /// Grace period before marking a device offline, in seconds.
    #[serde(default = "default_offline_grace")]
    pub offline_grace_seconds: u64,

    /// How long to wait (ms) after ping sweep for the kernel to finish
    /// populating ARP entries before reading the ARP table.
    #[serde(default = "default_arp_settle_millis")]
    pub arp_settle_millis: u64,

    /// Enable NetFlow v5 UDP collector.
    #[serde(default)]
    pub netflow_enabled: bool,

    /// UDP port for the NetFlow collector (default 9995).
    #[serde(default = "default_netflow_port")]
    pub netflow_port: u16,

    /// Enable passive mDNS/Bonjour discovery of device hostnames and services.
    #[serde(default = "default_mdns_enabled")]
    pub mdns_enabled: bool,
}

fn default_mdns_enabled() -> bool {
    true
}

fn default_scan_interval() -> u64 {
    60
}

fn default_offline_grace() -> u64 {
    300
}

fn default_arp_settle_millis() -> u64 {
    500
}

fn default_netflow_port() -> u16 {
    9995
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            subnets: Vec::new(),
            interval_seconds: default_scan_interval(),
            offline_grace_seconds: default_offline_grace(),
            arp_settle_millis: default_arp_settle_millis(),
            netflow_enabled: false,
            netflow_port: default_netflow_port(),
            mdns_enabled: default_mdns_enabled(),
        }
    }
}

/// Auth settings (mostly configured at runtime via UI).
#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    /// Session expiry in seconds (default 24 hours).
    #[serde(default = "default_session_expiry")]
    pub session_expiry_seconds: u64,

    /// IP addresses of trusted reverse proxies whose X-Forwarded-For header is trusted.
    /// Only add addresses you control. Defaults to loopback only.
    #[serde(default = "default_trusted_proxies")]
    pub trusted_proxies: Vec<String>,
}

fn default_session_expiry() -> u64 {
    86400
}

fn default_trusted_proxies() -> Vec<String> {
    vec!["127.0.0.1".to_string(), "::1".to_string()]
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            session_expiry_seconds: default_session_expiry(),
            trusted_proxies: default_trusted_proxies(),
        }
    }
}

/// Data retention / cleanup periods.
#[derive(Debug, Clone, Deserialize)]
pub struct RetentionConfig {
    /// Delete traffic_samples older than this many hours (default 48).
    #[serde(default = "default_traffic_samples_hours")]
    pub traffic_samples_hours: u64,

    /// Delete agent_reports older than this many days (default 7).
    #[serde(default = "default_agent_reports_days")]
    pub agent_reports_days: u64,

    /// Delete device_events older than this many days (default 30).
    #[serde(default = "default_device_events_days")]
    pub device_events_days: u64,

    /// Delete acknowledged alerts older than this many days (default 90).
    #[serde(default = "default_alerts_days")]
    pub alerts_days: u64,
}

fn default_traffic_samples_hours() -> u64 {
    48
}
fn default_agent_reports_days() -> u64 {
    7
}
fn default_device_events_days() -> u64 {
    30
}
fn default_alerts_days() -> u64 {
    90
}

impl Default for RetentionConfig {
    fn default() -> Self {
        Self {
            traffic_samples_hours: default_traffic_samples_hours(),
            agent_reports_days: default_agent_reports_days(),
            device_events_days: default_device_events_days(),
            alerts_days: default_alerts_days(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            listen: default_listen(),
            db_path: None,
            vyos: VyosConfig::default(),
            scanner: ScannerConfig::default(),
            auth: AuthConfig::default(),
            retention: RetentionConfig::default(),
        }
    }
}

impl AppConfig {
    /// Load configuration from a TOML file.
    pub fn from_file(path: &str) -> Result<Self> {
        let contents = std::fs::read_to_string(path)?;
        let config: AppConfig = toml::de::from_str(&contents)?;
        Ok(config)
    }
}
