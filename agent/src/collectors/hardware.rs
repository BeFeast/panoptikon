//! Hardware inventory collector — static hardware info (model, CPU, GPU, serial).
//!
//! Collects hardware details that rarely change, intended for the server's
//! `device_sysinfo` table.  Uses `sysinfo` where possible and falls back
//! to platform-specific files/commands for model, serial, and GPU.

use serde::Serialize;
use sysinfo::System;

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
