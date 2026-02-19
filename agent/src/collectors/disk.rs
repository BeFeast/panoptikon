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

/// Collect disk usage for all mounted filesystems.
pub fn collect() -> Vec<DiskInfo> {
    let disks = Disks::new_with_refreshed_list();

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
