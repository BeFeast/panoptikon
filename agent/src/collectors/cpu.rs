use serde::Serialize;
use sysinfo::System;

/// CPU usage information.
#[derive(Debug, Serialize)]
pub struct CpuInfo {
    pub count: usize,
    pub usage_percent: f32,
    pub load_avg: [f64; 3],
}

/// Collect CPU metrics.
pub fn collect(sys: &System) -> CpuInfo {
    let load = sysinfo::System::load_average();

    CpuInfo {
        count: sys.cpus().len(),
        usage_percent: sys.global_cpu_info().cpu_usage(),
        load_avg: [load.one, load.five, load.fifteen],
    }
}
