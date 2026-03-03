pub mod cpu;
pub mod disk;
pub mod fastfetch;
pub mod hardware;
pub mod memory;
pub mod network;
pub mod os;

use std::collections::HashMap;

use serde::Serialize;
use sysinfo::{Disks, Networks, System};

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
    /// Rich hardware/system info from fastfetch (if available).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fastfetch: Option<fastfetch::FastfetchInfo>,
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
    /// Cached fastfetch info (collected once at startup, refreshed periodically).
    fastfetch_info: Option<fastfetch::FastfetchInfo>,
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

        // Collect fastfetch info once at startup (graceful fallback if not available).
        let fastfetch_info = fastfetch::collect(None);

        Self {
            sys,
            disks,
            networks,
            report_count: 0,
            prev_net_counters: HashMap::new(),
            hardware_info,
            fastfetch_info,
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

        // Refresh fastfetch info every 10th cycle (~5 min at 30s interval).
        if self.report_count > 0 && self.report_count.is_multiple_of(10) {
            self.fastfetch_info = fastfetch::collect(config.fastfetch_path.as_deref());
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
            fastfetch: self.fastfetch_info.clone(),
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
