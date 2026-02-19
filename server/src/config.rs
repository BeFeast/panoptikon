use anyhow::Result;
use serde::Deserialize;

/// Application configuration loaded from a TOML file or defaults.
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    /// VyOS router HTTP API URL (e.g., "https://10.10.0.1").
    pub vyos_url: Option<String>,

    /// VyOS HTTP API key.
    pub vyos_api_key: Option<String>,

    /// ARP scan interval in seconds.
    #[serde(default = "default_scan_interval")]
    pub scan_interval_secs: u64,

    /// Subnets to scan (CIDR notation). If empty, auto-detect from VyOS.
    #[serde(default)]
    pub scan_subnets: Vec<String>,

    /// Grace period in seconds before marking a device as offline.
    #[serde(default = "default_offline_grace")]
    pub offline_grace_secs: u64,
}

fn default_scan_interval() -> u64 {
    60
}

fn default_offline_grace() -> u64 {
    300
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            vyos_url: None,
            vyos_api_key: None,
            scan_interval_secs: default_scan_interval(),
            scan_subnets: Vec::new(),
            offline_grace_secs: default_offline_grace(),
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
