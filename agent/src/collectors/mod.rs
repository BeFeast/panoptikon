pub mod cpu;
pub mod disk;
pub mod memory;
pub mod network;
pub mod os;

use serde::Serialize;

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
}

/// Collect all system metrics into a single report.
pub fn collect_all(config: &AgentConfig) -> AgentReport {
    let sys = sysinfo::System::new_all();

    AgentReport {
        agent_id: config.agent_id.clone(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        hostname: sysinfo::System::host_name().unwrap_or_else(|| "unknown".to_string()),
        os: os::collect(),
        uptime_seconds: sysinfo::System::uptime(),
        cpu: cpu::collect(&sys),
        memory: memory::collect(&sys),
        disks: disk::collect(),
        network_interfaces: network::collect(),
    }
}
