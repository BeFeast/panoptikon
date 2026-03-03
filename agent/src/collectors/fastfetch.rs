//! Fastfetch integration — runs `fastfetch --format json` as a subprocess
//! to collect rich hardware/system information.
//!
//! Falls back gracefully if fastfetch is not installed.

use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
use tracing::{debug, info, warn};

/// Parsed fastfetch JSON output — we only extract the modules we care about.
#[derive(Debug, Clone, Default)]
pub struct FastfetchData {
    pub cpu_name: Option<String>,
    pub cpu_cores_physical: Option<usize>,
    pub cpu_cores_logical: Option<usize>,
    pub cpu_freq_base_mhz: Option<u64>,
    pub cpu_freq_max_mhz: Option<u64>,
    pub gpu: Vec<FastfetchGpu>,
    pub memory_total: Option<u64>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub os_pretty_name: Option<String>,
    pub host_name: Option<String>,
    pub host_vendor: Option<String>,
    pub host_serial: Option<String>,
    pub bios_vendor: Option<String>,
    pub bios_version: Option<String>,
    pub board_name: Option<String>,
    pub board_vendor: Option<String>,
    pub physical_memory: Vec<FastfetchPhysicalMemory>,
    pub physical_disks: Vec<FastfetchPhysicalDisk>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FastfetchGpu {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub driver: Option<String>,
    pub vram_bytes: Option<u64>,
    pub gpu_type: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FastfetchPhysicalMemory {
    pub size_bytes: Option<u64>,
    pub mem_type: Option<String>,
    pub speed_mts: Option<u64>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct FastfetchPhysicalDisk {
    pub name: Option<String>,
    pub size_bytes: Option<u64>,
    pub kind: Option<String>,
    pub interconnect: Option<String>,
    pub serial: Option<String>,
}

/// Auto-detect fastfetch binary path.
/// Checks the provided config path first, then common locations, then PATH.
pub fn detect_path(config_path: Option<&str>) -> Option<PathBuf> {
    // 1. Explicit config path.
    if let Some(p) = config_path {
        let path = PathBuf::from(p);
        if path.exists() {
            return Some(path);
        }
        warn!(path = %p, "Configured fastfetch_path does not exist");
    }

    // 2. Common install locations.
    for candidate in &[
        "/usr/bin/fastfetch",
        "/usr/local/bin/fastfetch",
        "/opt/homebrew/bin/fastfetch",
    ] {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    // 3. Search PATH via `which`.
    if let Ok(output) = Command::new("which").arg("fastfetch").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    None
}

/// Run fastfetch and parse its JSON output.
/// Returns None if fastfetch is not available or fails.
pub fn collect(fastfetch_path: &PathBuf) -> Option<FastfetchData> {
    info!(path = %fastfetch_path.display(), "Running fastfetch");

    let output = Command::new(fastfetch_path)
        .args([
            "--format",
            "json",
            "--structure",
            "OS:Host:Kernel:CPU:GPU:Memory:Bios:Board:PhysicalMemory:PhysicalDisk:Battery",
        ])
        .output();

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            warn!(error = %e, "Failed to execute fastfetch");
            return None;
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        warn!(
            exit_code = ?output.status.code(),
            stderr = %stderr,
            "fastfetch exited with error"
        );
        return None;
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    parse_fastfetch_json(&json_str)
}

/// Parse the fastfetch JSON output into our structured data.
fn parse_fastfetch_json(json_str: &str) -> Option<FastfetchData> {
    let modules: Vec<FastfetchModule> = match serde_json::from_str(json_str) {
        Ok(m) => m,
        Err(e) => {
            warn!(error = %e, "Failed to parse fastfetch JSON");
            return None;
        }
    };

    let mut data = FastfetchData::default();

    for module in &modules {
        // Skip modules with errors.
        if module.error.is_some() {
            debug!(
                module_type = %module.module_type,
                error = ?module.error,
                "fastfetch module reported error, skipping"
            );
            continue;
        }

        let Some(ref result) = module.result else {
            continue;
        };

        match module.module_type.as_str() {
            "CPU" => parse_cpu(result, &mut data),
            "GPU" => parse_gpu(result, &mut data),
            "Memory" => parse_memory(result, &mut data),
            "OS" => parse_os(result, &mut data),
            "Host" => parse_host(result, &mut data),
            "BIOS" | "Bios" => parse_bios(result, &mut data),
            "Board" => parse_board(result, &mut data),
            "PhysicalMemory" => parse_physical_memory(result, &mut data),
            "PhysicalDisk" => parse_physical_disk(result, &mut data),
            _ => {}
        }
    }

    info!(
        cpu = ?data.cpu_name,
        gpus = data.gpu.len(),
        physical_disks = data.physical_disks.len(),
        "fastfetch data collected"
    );

    Some(data)
}

// --- Fastfetch JSON structures (for deserialization) ---

#[derive(Debug, Deserialize)]
struct FastfetchModule {
    #[serde(rename = "type")]
    module_type: String,
    result: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<String>,
}

fn parse_cpu(value: &serde_json::Value, data: &mut FastfetchData) {
    data.cpu_name = value
        .get("cpu")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if let Some(cores) = value.get("cores") {
        data.cpu_cores_physical = cores
            .get("physical")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize);
        data.cpu_cores_logical = cores
            .get("logical")
            .and_then(|v| v.as_u64())
            .map(|v| v as usize);
    }

    if let Some(freq) = value.get("frequency") {
        data.cpu_freq_base_mhz = freq.get("base").and_then(|v| v.as_u64());
        data.cpu_freq_max_mhz = freq.get("max").and_then(|v| v.as_u64()).filter(|&v| v > 0);
    }
}

fn parse_gpu(value: &serde_json::Value, data: &mut FastfetchData) {
    // GPU result is an array.
    let gpus = match value.as_array() {
        Some(arr) => arr,
        None => return,
    };

    for gpu_val in gpus {
        let name = gpu_val
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let vendor = gpu_val
            .get("vendor")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let driver = gpu_val
            .get("driver")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // VRAM from memory.dedicated.total
        let vram_bytes = gpu_val
            .get("memory")
            .and_then(|m| m.get("dedicated"))
            .and_then(|d| d.get("total"))
            .and_then(|v| v.as_u64());

        // GPU type: integrated, discrete, etc.
        let gpu_type = gpu_val
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        data.gpu.push(FastfetchGpu {
            name,
            vendor,
            driver,
            vram_bytes,
            gpu_type,
        });
    }
}

fn parse_memory(value: &serde_json::Value, data: &mut FastfetchData) {
    data.memory_total = value.get("total").and_then(|v| v.as_u64());
}

fn parse_os(value: &serde_json::Value, data: &mut FastfetchData) {
    data.os_name = value
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.os_version = value
        .get("versionID")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.os_pretty_name = value
        .get("prettyName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
}

fn parse_host(value: &serde_json::Value, data: &mut FastfetchData) {
    data.host_name = value
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.host_vendor = value
        .get("vendor")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.host_serial = value
        .get("serial")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
}

fn parse_bios(value: &serde_json::Value, data: &mut FastfetchData) {
    data.bios_vendor = value
        .get("vendor")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.bios_version = value
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
}

fn parse_board(value: &serde_json::Value, data: &mut FastfetchData) {
    data.board_name = value
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    data.board_vendor = value
        .get("vendor")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
}

fn parse_physical_memory(value: &serde_json::Value, data: &mut FastfetchData) {
    // PhysicalMemory result is an array of DIMMs.
    let dimms = match value.as_array() {
        Some(arr) => arr,
        None => return,
    };

    for dimm in dimms {
        let size_bytes = dimm.get("size").and_then(|v| v.as_u64());
        let mem_type = dimm
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let speed_mts = dimm.get("maxSpeed").and_then(|v| v.as_u64());

        data.physical_memory.push(FastfetchPhysicalMemory {
            size_bytes,
            mem_type,
            speed_mts,
        });
    }
}

fn parse_physical_disk(value: &serde_json::Value, data: &mut FastfetchData) {
    // PhysicalDisk result is an array.
    let disks = match value.as_array() {
        Some(arr) => arr,
        None => return,
    };

    for disk in disks {
        let name = disk
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let size_bytes = disk.get("size").and_then(|v| v.as_u64());
        let kind = disk
            .get("kind")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let interconnect = disk
            .get("interconnect")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let serial = disk
            .get("serial")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // Skip removable media (CD-ROMs).
        let removable = disk
            .get("removable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if removable {
            continue;
        }

        data.physical_disks.push(FastfetchPhysicalDisk {
            name,
            size_bytes,
            kind,
            interconnect,
            serial,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_fastfetch_json() {
        let json = r#"[
            {
                "type": "CPU",
                "result": {
                    "cpu": "Intel(R) Core(TM) i5-6500T",
                    "vendor": "GenuineIntel",
                    "cores": { "physical": 4, "logical": 4 },
                    "frequency": { "base": 2500, "max": 3100 }
                }
            },
            {
                "type": "GPU",
                "result": [
                    {
                        "name": "NVIDIA GeForce RTX 4090",
                        "vendor": "NVIDIA Corporation",
                        "driver": "nvidia",
                        "memory": { "dedicated": { "total": 25769803776, "used": null }, "shared": { "total": null, "used": null }, "type": null },
                        "type": "Discrete"
                    }
                ]
            },
            {
                "type": "Memory",
                "result": { "total": 17179869184, "used": 8589934592 }
            },
            {
                "type": "Host",
                "result": { "name": "MacBookPro18,1", "vendor": "Apple Inc.", "serial": "C02XL0AFJG5J" }
            },
            {
                "type": "BIOS",
                "result": { "vendor": "Apple Inc.", "version": "10151.101.3" }
            },
            {
                "type": "Board",
                "result": { "name": "Mac-937A206F2EE63C01", "vendor": "Apple Inc." }
            },
            {
                "type": "PhysicalDisk",
                "result": [
                    {
                        "name": "APPLE SSD AP0512Q",
                        "size": 500107862016,
                        "kind": "SSD",
                        "interconnect": "NVMe",
                        "serial": "ABC123",
                        "removable": false,
                        "readOnly": false
                    }
                ]
            },
            {
                "type": "OS",
                "result": { "name": "macOS", "versionID": "15.3.2", "prettyName": "macOS 15.3.2 Sequoia" }
            },
            {
                "type": "Display",
                "error": "No display found"
            }
        ]"#;

        let data = parse_fastfetch_json(json).expect("should parse");
        assert_eq!(data.cpu_name.as_deref(), Some("Intel(R) Core(TM) i5-6500T"));
        assert_eq!(data.cpu_cores_physical, Some(4));
        assert_eq!(data.cpu_freq_base_mhz, Some(2500));
        assert_eq!(data.cpu_freq_max_mhz, Some(3100));
        assert_eq!(data.gpu.len(), 1);
        assert_eq!(data.gpu[0].name.as_deref(), Some("NVIDIA GeForce RTX 4090"));
        assert_eq!(data.gpu[0].vram_bytes, Some(25769803776));
        assert_eq!(data.gpu[0].gpu_type.as_deref(), Some("Discrete"));
        assert_eq!(data.memory_total, Some(17179869184));
        assert_eq!(data.host_name.as_deref(), Some("MacBookPro18,1"));
        assert_eq!(data.host_serial.as_deref(), Some("C02XL0AFJG5J"));
        assert_eq!(data.bios_vendor.as_deref(), Some("Apple Inc."));
        assert_eq!(data.bios_version.as_deref(), Some("10151.101.3"));
        assert_eq!(data.board_name.as_deref(), Some("Mac-937A206F2EE63C01"));
        assert_eq!(data.physical_disks.len(), 1);
        assert_eq!(
            data.physical_disks[0].name.as_deref(),
            Some("APPLE SSD AP0512Q")
        );
        assert_eq!(data.os_name.as_deref(), Some("macOS"));
    }

    #[test]
    fn test_parse_empty_json() {
        let data = parse_fastfetch_json("[]").expect("should parse empty array");
        assert!(data.cpu_name.is_none());
        assert!(data.gpu.is_empty());
    }

    #[test]
    fn test_parse_invalid_json() {
        assert!(parse_fastfetch_json("not json").is_none());
    }

    #[test]
    fn test_removable_disks_filtered() {
        let json = r#"[
            {
                "type": "PhysicalDisk",
                "result": [
                    { "name": "CD-ROM", "size": 1073741312, "removable": true },
                    { "name": "SSD", "size": 500000000000, "removable": false }
                ]
            }
        ]"#;

        let data = parse_fastfetch_json(json).expect("should parse");
        assert_eq!(data.physical_disks.len(), 1);
        assert_eq!(data.physical_disks[0].name.as_deref(), Some("SSD"));
    }
}
