use serde::Serialize;
use sysinfo::System;

/// Operating system information.
#[derive(Debug, Serialize)]
pub struct OsInfo {
    pub name: String,
    pub version: String,
    pub kernel: String,
    pub arch: String,
}

/// Collect OS information.
pub fn collect() -> OsInfo {
    OsInfo {
        name: System::name().unwrap_or_else(|| "unknown".to_string()),
        version: System::os_version().unwrap_or_else(|| "unknown".to_string()),
        kernel: System::kernel_version().unwrap_or_else(|| "unknown".to_string()),
        arch: std::env::consts::ARCH.to_string(),
    }
}
