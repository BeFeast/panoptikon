use serde::Serialize;
use sysinfo::Disks;

/// Disk usage information for a single mount point.
#[derive(Debug, Serialize)]
pub struct DiskInfo {
    pub mount: String,
    pub filesystem: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
}

/// Collect disk usage from a pre-refreshed `Disks` instance.
pub fn collect_from(disks: &Disks) -> Vec<DiskInfo> {
    disks
        .iter()
        .filter(|d| {
            // Filter out pseudo-filesystems.
            let fs = d.file_system().to_string_lossy();
            !fs.starts_with("tmpfs") && !fs.starts_with("devtmpfs") && !fs.starts_with("squashfs")
        })
        .map(|d| {
            let total = d.total_space();
            let available = d.available_space();
            DiskInfo {
                mount: d.mount_point().to_string_lossy().to_string(),
                filesystem: d.file_system().to_string_lossy().to_string(),
                total_bytes: total,
                used_bytes: total.saturating_sub(available),
            }
        })
        .collect()
}
