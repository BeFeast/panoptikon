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
}

fn default_scan_interval() -> u64 {
    60
}

fn default_offline_grace() -> u64 {
    300
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            subnets: Vec::new(),
            interval_seconds: default_scan_interval(),
            offline_grace_seconds: default_offline_grace(),
        }
    }
}

/// Auth settings (mostly configured at runtime via UI).
#[derive(Debug, Clone, Default, Deserialize)]
pub struct AuthConfig {
    /// Session expiry in seconds (default 24 hours).
    #[serde(default = "default_session_expiry")]
    pub session_expiry_seconds: u64,
}

fn default_session_expiry() -> u64 {
    86400
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            listen: default_listen(),
            db_path: None,
            vyos: VyosConfig::default(),
            scanner: ScannerConfig::default(),
            auth: AuthConfig::default(),
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
