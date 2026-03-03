//! Hardware inventory collector — static hardware info (model, CPU, GPU, serial).
//!
//! Collects hardware details that rarely change, intended for the server's
//! `device_sysinfo` table.  Uses `sysinfo` where possible and falls back
//! to platform-specific files/commands for model, serial, and GPU.

use serde::Serialize;
use sysinfo::System;

use super::fastfetch::FastfetchData;

/// Static hardware inventory sent alongside periodic reports.
#[derive(Debug, Clone, Serialize)]
pub struct HardwareInfo {
    pub hardware_model: Option<String>,
    pub cpu_name: Option<String>,
    pub cpu_cores: Option<usize>,
    pub cpu_speed_mhz: Option<u64>,
    pub ram_total_bytes: Option<u64>,
    pub gpu_name: Option<String>,
    pub disk_name: Option<String>,
    pub disk_size_bytes: Option<u64>,
    pub serial_number: Option<String>,
    // Extended fields from fastfetch:
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motherboard_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bios_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bios_vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ram_speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_vram: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_type: Option<String>,
    /// Source of hardware data: "sysinfo" or "fastfetch".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collector_source: Option<String>,
}

/// Collect hardware inventory (called once at startup).
pub fn collect(sys: &System) -> HardwareInfo {
    let cpu_name = sys.cpus().first().map(|c| c.brand().to_string());
    let cpu_cores = sys.physical_core_count();
    let cpu_speed_mhz = sys.cpus().first().map(|c| c.frequency());
    let ram_total_bytes = Some(sys.total_memory());

    let (disk_name, disk_size_bytes) = primary_disk();
    let gpu_name = detect_gpu();
    let hardware_model = detect_hardware_model();
    let serial_number = detect_serial_number();

    HardwareInfo {
        hardware_model,
        cpu_name,
        cpu_cores,
        cpu_speed_mhz,
        ram_total_bytes,
        gpu_name,
        disk_name,
        disk_size_bytes,
        serial_number,
        motherboard_name: None,
        bios_version: None,
        bios_vendor: None,
        ram_type: None,
        ram_speed: None,
        gpu_vram: None,
        gpu_type: None,
        collector_source: Some("sysinfo".to_string()),
    }
}

/// Detect the primary (largest) disk name and size.
fn primary_disk() -> (Option<String>, Option<u64>) {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    disks
        .iter()
        .filter(|d| {
            let fs = d.file_system().to_string_lossy();
            !fs.starts_with("tmpfs") && !fs.starts_with("devtmpfs") && !fs.starts_with("squashfs")
        })
        .max_by_key(|d| d.total_space())
        .map(|d| {
            let name = d.name().to_string_lossy().to_string();
            (Some(name), Some(d.total_space()))
        })
        .unwrap_or((None, None))
}

/// Detect GPU name via platform-specific methods.
fn detect_gpu() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        // Try /proc/driver/nvidia/gpus/*/information first (NVIDIA proprietary).
        if let Ok(entries) = std::fs::read_dir("/proc/driver/nvidia/gpus") {
            for entry in entries.flatten() {
                let info_path = entry.path().join("information");
                if let Ok(content) = std::fs::read_to_string(&info_path) {
                    for line in content.lines() {
                        if line.starts_with("Model:") {
                            return Some(line.trim_start_matches("Model:").trim().to_string());
                        }
                    }
                }
            }
        }

        // Fallback: parse lspci output.
        if let Ok(output) = std::process::Command::new("lspci").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("VGA") || line.contains("3D controller") {
                    // Format: "01:00.0 VGA compatible controller: NVIDIA Corporation ..."
                    if let Some((_prefix, desc)) = line.split_once(": ") {
                        // Split again at the second colon for the description
                        if let Some((_cat, name)) = desc.split_once(": ") {
                            return Some(name.trim().to_string());
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType", "-json"])
            .output()
        {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                if let Some(displays) = json.get("SPDisplaysDataType").and_then(|d| d.as_array()) {
                    if let Some(first) = displays.first() {
                        if let Some(name) = first
                            .get("sppci_model")
                            .or_else(|| first.get("_name"))
                            .and_then(|v| v.as_str())
                        {
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

/// Detect hardware model (e.g. "MacBookPro18,1", "Dell PowerEdge R740").
fn detect_hardware_model() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(model) = std::fs::read_to_string("/sys/class/dmi/id/product_name") {
            let model = model.trim().to_string();
            if !model.is_empty() && model != "To Be Filled By O.E.M." {
                return Some(model);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "hw.model"])
            .output()
        {
            let model = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !model.is_empty() {
                return Some(model);
            }
        }
    }

    None
}

/// Detect hardware serial number.
fn detect_serial_number() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(serial) = std::fs::read_to_string("/sys/class/dmi/id/product_serial") {
            let serial = serial.trim().to_string();
            if !serial.is_empty() && serial != "To Be Filled By O.E.M." && serial != "Not Specified"
            {
                return Some(serial);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("system_profiler")
            .args(["SPHardwareDataType", "-json"])
            .output()
        {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                if let Some(hw) = json.get("SPHardwareDataType").and_then(|d| d.as_array()) {
                    if let Some(first) = hw.first() {
                        if let Some(serial) = first.get("serial_number").and_then(|v| v.as_str()) {
                            return Some(serial.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

/// Format bytes into a human-readable string (e.g. "16.0 GB").
fn format_bytes_human(bytes: u64) -> String {
    const GB: f64 = 1_073_741_824.0;
    const MB: f64 = 1_048_576.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1} GB", b / GB)
    } else {
        format!("{:.0} MB", b / MB)
    }
}

/// Enrich a sysinfo-based `HardwareInfo` with data from fastfetch.
///
/// Fastfetch data takes precedence for fields it provides, since
/// it typically has richer information (GPU VRAM, RAM type/speed,
/// motherboard, BIOS, etc.).
pub fn enrich_with_fastfetch(hw: &mut HardwareInfo, ff: &FastfetchData) {
    // CPU — prefer fastfetch's more detailed CPU name.
    if ff.cpu_name.is_some() {
        hw.cpu_name = ff.cpu_name.clone();
    }
    if let Some(cores) = ff.cpu_cores_physical {
        hw.cpu_cores = Some(cores);
    }
    if let Some(freq) = ff.cpu_freq_base_mhz {
        hw.cpu_speed_mhz = Some(freq);
    }

    // Memory — prefer fastfetch total if available.
    if let Some(total) = ff.memory_total {
        hw.ram_total_bytes = Some(total);
    }

    // GPU — use first GPU from fastfetch.
    if let Some(gpu) = ff.gpu.first() {
        if let Some(ref name) = gpu.name {
            hw.gpu_name = Some(name.clone());
        }
        if let Some(vram) = gpu.vram_bytes {
            hw.gpu_vram = Some(format_bytes_human(vram));
        }
        if let Some(ref gt) = gpu.gpu_type {
            hw.gpu_type = Some(gt.clone());
        }
    }

    // Host/Model — prefer fastfetch.
    if let Some(ref name) = ff.host_name {
        hw.hardware_model = Some(name.clone());
    }

    // Serial number — prefer fastfetch if available.
    if ff.host_serial.is_some() {
        hw.serial_number = ff.host_serial.clone();
    }

    // Motherboard.
    if let Some(ref board) = ff.board_name {
        let board_str = match &ff.board_vendor {
            Some(vendor) => format!("{} {}", vendor, board),
            None => board.clone(),
        };
        hw.motherboard_name = Some(board_str);
    }

    // BIOS.
    hw.bios_vendor = ff.bios_vendor.clone();
    hw.bios_version = ff.bios_version.clone();

    // Physical memory (RAM type/speed from first DIMM).
    if let Some(dimm) = ff.physical_memory.first() {
        if let Some(ref mt) = dimm.mem_type {
            hw.ram_type = Some(mt.clone());
        }
        if let Some(speed) = dimm.speed_mts {
            hw.ram_speed = Some(format!("{} MT/s", speed));
        }
    }

    // Physical disk — prefer the largest non-removable disk from fastfetch.
    if let Some(disk) = ff
        .physical_disks
        .iter()
        .max_by_key(|d| d.size_bytes.unwrap_or(0))
    {
        if let Some(ref name) = disk.name {
            hw.disk_name = Some(name.clone());
        }
        if let Some(size) = disk.size_bytes {
            hw.disk_size_bytes = Some(size);
        }
    }

    hw.collector_source = Some("fastfetch".to_string());
}
