use serde::Serialize;
use sysinfo::System;

/// Memory usage information.
#[derive(Debug, Serialize)]
pub struct MemoryInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

/// Collect memory and swap metrics.
pub fn collect(sys: &System) -> MemoryInfo {
    MemoryInfo {
        total_bytes: sys.total_memory(),
        used_bytes: sys.used_memory(),
        swap_total_bytes: sys.total_swap(),
        swap_used_bytes: sys.used_swap(),
    }
}
