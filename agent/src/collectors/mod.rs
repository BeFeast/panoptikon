pub mod cpu;
pub mod disk;
pub mod fastfetch;
pub mod hardware;
pub mod memory;
pub mod network;
pub mod os;

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;
use sysinfo::{Disks, Networks, System};
use tracing::{info, warn};

use crate::config::AgentConfig;

/// A complete system report sent to the server.
#[derive(Debug, Serialize)]
pub struct AgentReport {
    pub agent_id: String,
    pub timestamp: String,
    pub version: String,
    pub hostname: String,
    pub os: os::OsInfo,
    pub uptime_seconds: u64,
    pub cpu: cpu::CpuInfo,
    pub memory: memory::MemoryInfo,
    pub disks: Vec<disk::DiskInfo>,
    pub network_interfaces: Vec<network::NetworkInterface>,
    /// Static hardware inventory (model, GPU, serial, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware: Option<hardware::HardwareInfo>,
}

/// Long-lived system metrics collector.
///
/// Holds `sysinfo` structs across report cycles to avoid re-enumerating
/// processes, disks, and interfaces on every 30-second report.
/// CPU and memory are refreshed every cycle; disks and network only
/// every 5th cycle (~2.5 minutes at default 30 s interval).
pub struct SystemCollector {
    sys: System,
    disks: Disks,
    networks: Networks,
    report_count: u64,
    prev_net_counters: HashMap<String, (u64, u64)>,
    /// Cached hardware inventory (collected once at startup).
    hardware_info: hardware::HardwareInfo,
    /// Resolved path to the fastfetch binary (None if not available).
    fastfetch_path: Option<PathBuf>,
    /// Tick counter for periodic fastfetch refresh (every 10th cycle = ~5 min at 30s).
    fastfetch_refresh_interval: u64,
}

impl SystemCollector {
    /// Create a new collector, performing an initial full enumeration.
    ///
    /// Sleeps 200 ms after `System::new_all()` so that the first
    /// `refresh_cpu_all()` returns meaningful usage percentages
    /// (sysinfo needs two measurements to compute delta-based CPU %).
    pub fn new() -> Self {
        let mut sys = System::new_all();
        std::thread::sleep(std::time::Duration::from_millis(200));
        sys.refresh_cpu_usage();

        let disks = Disks::new_with_refreshed_list();
        let networks = Networks::new_with_refreshed_list();

        // Collect static hardware info once via sysinfo.
        let hardware_info = hardware::collect(&sys);

        Self {
            sys,
            disks,
            networks,
            report_count: 0,
            prev_net_counters: HashMap::new(),
            hardware_info,
            fastfetch_path: None,
            fastfetch_refresh_interval: 10, // ~5 min at 30s interval
        }
    }

    /// Initialize fastfetch integration.
    /// Should be called after construction with the agent config.
    pub fn init_fastfetch(&mut self, config: &AgentConfig) {
        // If config sets fastfetch_path to empty string, disable fastfetch.
        if config.fastfetch_path.as_deref() == Some("") {
            info!("Fastfetch integration disabled by config (empty path)");
            return;
        }

        let ff_path = fastfetch::detect_path(config.fastfetch_path.as_deref());

        match ff_path {
            Some(ref path) => {
                info!(path = %path.display(), "Fastfetch binary detected");
                self.fastfetch_path = ff_path;
                // Run initial fastfetch collection.
                self.refresh_fastfetch();
            }
            None => {
                warn!("Fastfetch not found — using sysinfo-only hardware collection");
            }
        }
    }

    /// Run fastfetch and merge results into cached hardware info.
    fn refresh_fastfetch(&mut self) {
        let Some(ref path) = self.fastfetch_path else {
            return;
        };

        if let Some(ff_data) = fastfetch::collect(path) {
            hardware::enrich_with_fastfetch(&mut self.hardware_info, &ff_data);
            info!("Hardware info enriched with fastfetch data");
        }
    }

    /// Collect a full system report using incremental refresh.
    ///
    /// CPU and memory are refreshed on every call (lightweight).
    /// Disks and network interfaces are refreshed only every 5th call
    /// to avoid the heavier enumeration cost.
    pub fn collect(&mut self, config: &AgentConfig) -> AgentReport {
        // Always refresh CPU and memory (lightweight).
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();

        // Heavy refresh (disks, networks) only every 5th cycle.
        if self.report_count.is_multiple_of(5) {
            self.disks.refresh_list();
            self.networks.refresh_list();
        }

        // Periodic fastfetch refresh (every Nth cycle, ~5 min at 30s).
        if self.fastfetch_path.is_some()
            && self.report_count > 0
            && self
                .report_count
                .is_multiple_of(self.fastfetch_refresh_interval)
        {
            self.refresh_fastfetch();
        }

        let network_interfaces = network::collect_from(&self.networks, &mut self.prev_net_counters);

        self.report_count += 1;

        AgentReport {
            agent_id: config.agent_id.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            hostname: System::host_name().unwrap_or_else(|| "unknown".to_string()),
            os: os::collect(),
            uptime_seconds: System::uptime(),
            cpu: cpu::collect(&self.sys),
            memory: memory::collect(&self.sys),
            disks: disk::collect_from(&self.disks),
            network_interfaces,
            hardware: Some(self.hardware_info.clone()),
        }
    }

    /// Returns the current report count (useful for testing).
    #[cfg(test)]
    pub fn report_count(&self) -> u64 {
        self.report_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collector_new_returns_valid() {
        let collector = SystemCollector::new();
        assert_eq!(collector.report_count(), 0);
    }

    #[test]
    fn test_collector_increments_count() {
        let mut collector = SystemCollector::new();
        let config = AgentConfig {
            server_url: "ws://localhost:8080".to_string(),
            api_key: "test-key".to_string(),
            agent_id: "test-agent".to_string(),
            report_interval_secs: 30,
            fastfetch_path: None,
        };
        let report = collector.collect(&config);
        assert_eq!(collector.report_count(), 1);
        assert_eq!(report.agent_id, "test-agent");
    }
}
