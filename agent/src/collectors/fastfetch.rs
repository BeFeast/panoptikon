//! Fastfetch collector — runs `fastfetch --format json` as subprocess and
//! parses the structured JSON output for rich hardware/system information.
//!
//! Falls back gracefully if fastfetch is not installed.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;
use tracing::{debug, info, warn};

/// Parsed fastfetch output containing rich hardware/system information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<FastfetchCpu>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu: Option<Vec<FastfetchGpu>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<FastfetchMemory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage: Option<Vec<FastfetchStorage>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os: Option<FastfetchOs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<FastfetchHost>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bios: Option<FastfetchBios>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kernel: Option<FastfetchKernel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub battery: Option<Vec<FastfetchBattery>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub physical_memory: Option<Vec<FastfetchPhysicalMemory>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchCpu {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub cores_physical: Option<i32>,
    pub cores_logical: Option<i32>,
    pub freq_base_mhz: Option<u64>,
    pub freq_max_mhz: Option<u64>,
    pub temperature: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchGpu {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub driver: Option<String>,
    #[serde(rename = "type")]
    pub gpu_type: Option<String>,
    pub vram_mb: Option<u64>,
    pub temperature: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchMemory {
    pub total_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchStorage {
    pub name: Option<String>,
    pub mountpoint: Option<String>,
    pub filesystem: Option<String>,
    pub total_bytes: Option<u64>,
    pub used_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchOs {
    pub name: Option<String>,
    pub version: Option<String>,
    pub id: Option<String>,
    pub pretty_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchHost {
    pub name: Option<String>,
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchBios {
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub date: Option<String>,
    pub bios_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchKernel {
    pub name: Option<String>,
    pub release: Option<String>,
    pub architecture: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchBattery {
    pub capacity: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastfetchPhysicalMemory {
    pub size_bytes: Option<u64>,
    pub speed_mts: Option<u64>,
    pub mem_type: Option<String>,
    pub bank_locator: Option<String>,
}

/// Try to find the fastfetch binary on the system.
fn find_fastfetch(configured_path: Option<&str>) -> Option<PathBuf> {
    // 1. Use explicitly configured path.
    if let Some(path) = configured_path {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
        warn!(path, "Configured fastfetch_path does not exist");
    }

    // 2. Try common locations.
    let candidates = [
        "/usr/bin/fastfetch",
        "/usr/local/bin/fastfetch",
        "/opt/homebrew/bin/fastfetch",
    ];

    for candidate in &candidates {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }

    // 3. Try PATH via `which`.
    if let Ok(output) = Command::new("which").arg("fastfetch").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    None
}

/// Run fastfetch and parse the JSON output.
/// Returns `None` if fastfetch is not available or produces invalid output.
pub fn collect(configured_path: Option<&str>) -> Option<FastfetchInfo> {
    let fastfetch_bin = find_fastfetch(configured_path)?;

    info!(path = %fastfetch_bin.display(), "Running fastfetch");

    // Request all hardware-relevant modules explicitly to get maximum info.
    let output = Command::new(&fastfetch_bin)
        .args([
            "--format",
            "json",
            "--structure",
            "OS:Host:Kernel:CPU:GPU:Memory:Disk:Battery:BIOS:PhysicalMemory",
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
        warn!(
            status = ?output.status,
            stderr = %String::from_utf8_lossy(&output.stderr),
            "fastfetch exited with non-zero status"
        );
        return None;
    }

    let raw: Vec<serde_json::Value> = match serde_json::from_slice(&output.stdout) {
        Ok(v) => v,
        Err(e) => {
            warn!(error = %e, "Failed to parse fastfetch JSON output");
            return None;
        }
    };

    Some(parse_fastfetch_output(&raw))
}

/// Parse the array of fastfetch module outputs into our structured type.
fn parse_fastfetch_output(modules: &[serde_json::Value]) -> FastfetchInfo {
    let mut info = FastfetchInfo {
        cpu: None,
        gpu: None,
        memory: None,
        storage: None,
        os: None,
        host: None,
        bios: None,
        kernel: None,
        battery: None,
        physical_memory: None,
    };

    for module in modules {
        let module_type = module
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let result = module.get("result");

        // Skip modules that returned an error.
        if module.get("error").is_some() {
            debug!(module_type, "fastfetch module returned error, skipping");
            continue;
        }

        let Some(result) = result else { continue };

        match module_type {
            "CPU" => info.cpu = parse_cpu(result),
            "GPU" => info.gpu = parse_gpu(result),
            "Memory" => info.memory = parse_memory(result),
            "Disk" => info.storage = parse_disks(result),
            "OS" => info.os = parse_os(result),
            "Host" => info.host = parse_host(result),
            "BIOS" => info.bios = parse_bios(result),
            "Kernel" => info.kernel = parse_kernel(result),
            "Battery" => info.battery = parse_battery(result),
            "PhysicalMemory" => info.physical_memory = parse_physical_memory(result),
            _ => {}
        }
    }

    info
}

fn parse_cpu(v: &serde_json::Value) -> Option<FastfetchCpu> {
    Some(FastfetchCpu {
        name: v.get("cpu").and_then(|v| v.as_str()).map(|s| s.to_string()),
        vendor: v
            .get("vendor")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        cores_physical: v
            .get("cores")
            .and_then(|c| c.get("physical"))
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        cores_logical: v
            .get("cores")
            .and_then(|c| c.get("logical"))
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        freq_base_mhz: v
            .get("frequency")
            .and_then(|f| f.get("base"))
            .and_then(|v| v.as_u64()),
        freq_max_mhz: v
            .get("frequency")
            .and_then(|f| f.get("max"))
            .and_then(|v| v.as_u64())
            .filter(|&v| v > 0),
        temperature: v.get("temperature").and_then(|v| v.as_f64()),
    })
}

fn parse_gpu(v: &serde_json::Value) -> Option<Vec<FastfetchGpu>> {
    let arr = v.as_array()?;
    let gpus: Vec<FastfetchGpu> = arr
        .iter()
        .map(|g| FastfetchGpu {
            name: g
                .get("name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            vendor: g
                .get("vendor")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            driver: g
                .get("driver")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            gpu_type: g
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            vram_mb: g
                .get("memory")
                .and_then(|m| m.get("dedicated"))
                .and_then(|d| d.get("total"))
                .and_then(|v| v.as_u64())
                .map(|bytes| bytes / (1024 * 1024)),
            temperature: g.get("temperature").and_then(|v| v.as_f64()),
        })
        .collect();

    if gpus.is_empty() {
        None
    } else {
        Some(gpus)
    }
}

fn parse_memory(v: &serde_json::Value) -> Option<FastfetchMemory> {
    Some(FastfetchMemory {
        total_bytes: v.get("total").and_then(|v| v.as_u64()),
        used_bytes: v.get("used").and_then(|v| v.as_u64()),
    })
}

fn parse_disks(v: &serde_json::Value) -> Option<Vec<FastfetchStorage>> {
    let arr = v.as_array()?;
    let disks: Vec<FastfetchStorage> = arr
        .iter()
        .map(|d| {
            let bytes = d.get("bytes");
            FastfetchStorage {
                name: d
                    .get("mountFrom")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                mountpoint: d
                    .get("mountpoint")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                filesystem: d
                    .get("filesystem")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                total_bytes: bytes.and_then(|b| b.get("total")).and_then(|v| v.as_u64()),
                used_bytes: bytes.and_then(|b| b.get("used")).and_then(|v| v.as_u64()),
            }
        })
        .collect();

    if disks.is_empty() {
        None
    } else {
        Some(disks)
    }
}

fn parse_os(v: &serde_json::Value) -> Option<FastfetchOs> {
    Some(FastfetchOs {
        name: v
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        version: v
            .get("versionID")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        id: v.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()),
        pretty_name: v
            .get("prettyName")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

fn parse_host(v: &serde_json::Value) -> Option<FastfetchHost> {
    Some(FastfetchHost {
        name: v
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        vendor: v
            .get("vendor")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        version: v
            .get("version")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        serial: v
            .get("serial")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
    })
}

fn parse_bios(v: &serde_json::Value) -> Option<FastfetchBios> {
    Some(FastfetchBios {
        vendor: v
            .get("vendor")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        version: v
            .get("version")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        date: v
            .get("date")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        bios_type: v
            .get("type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

fn parse_kernel(v: &serde_json::Value) -> Option<FastfetchKernel> {
    Some(FastfetchKernel {
        name: v
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        release: v
            .get("release")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        architecture: v
            .get("architecture")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    })
}

fn parse_battery(v: &serde_json::Value) -> Option<Vec<FastfetchBattery>> {
    let arr = v.as_array()?;
    let batteries: Vec<FastfetchBattery> = arr
        .iter()
        .map(|b| FastfetchBattery {
            capacity: b.get("capacity").and_then(|v| v.as_f64()),
            status: b
                .get("status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        })
        .collect();

    if batteries.is_empty() {
        None
    } else {
        Some(batteries)
    }
}

fn parse_physical_memory(v: &serde_json::Value) -> Option<Vec<FastfetchPhysicalMemory>> {
    let arr = v.as_array()?;
    let modules: Vec<FastfetchPhysicalMemory> = arr
        .iter()
        .map(|m| FastfetchPhysicalMemory {
            size_bytes: m.get("size").and_then(|v| v.as_u64()),
            speed_mts: m
                .get("maxSpeed")
                .and_then(|v| v.as_u64())
                .filter(|&v| v > 0),
            mem_type: m
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            bank_locator: m
                .get("bankLocator")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        })
        .collect();

    if modules.is_empty() {
        None
    } else {
        Some(modules)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty_output() {
        let info = parse_fastfetch_output(&[]);
        assert!(info.cpu.is_none());
        assert!(info.gpu.is_none());
        assert!(info.memory.is_none());
    }

    #[test]
    fn test_parse_cpu_module() {
        let module = serde_json::json!({
            "type": "CPU",
            "result": {
                "cpu": "Intel Core i7-12700K",
                "vendor": "GenuineIntel",
                "cores": { "physical": 12, "logical": 20 },
                "frequency": { "base": 3600, "max": 5000 },
                "temperature": 45.0
            }
        });

        let info = parse_fastfetch_output(&[module]);
        let cpu = info.cpu.unwrap();
        assert_eq!(cpu.name.as_deref(), Some("Intel Core i7-12700K"));
        assert_eq!(cpu.cores_physical, Some(12));
        assert_eq!(cpu.cores_logical, Some(20));
        assert_eq!(cpu.freq_base_mhz, Some(3600));
        assert_eq!(cpu.freq_max_mhz, Some(5000));
    }

    #[test]
    fn test_parse_gpu_module() {
        let module = serde_json::json!({
            "type": "GPU",
            "result": [{
                "name": "NVIDIA GeForce RTX 4090",
                "vendor": "NVIDIA",
                "driver": "nvidia",
                "type": "Discrete",
                "memory": { "dedicated": { "total": 25769803776_u64, "used": null }, "shared": { "total": null, "used": null }, "type": null }
            }]
        });

        let info = parse_fastfetch_output(&[module]);
        let gpus = info.gpu.unwrap();
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name.as_deref(), Some("NVIDIA GeForce RTX 4090"));
        assert_eq!(gpus[0].vram_mb, Some(24576)); // 24 GB
    }

    #[test]
    fn test_parse_with_error_module() {
        let module = serde_json::json!({
            "type": "Battery",
            "error": "No battery found"
        });

        let info = parse_fastfetch_output(&[module]);
        assert!(info.battery.is_none());
    }

    #[test]
    fn test_parse_bios_module() {
        let module = serde_json::json!({
            "type": "BIOS",
            "result": {
                "vendor": "American Megatrends Inc.",
                "version": "1.60",
                "date": "01/15/2023",
                "type": "UEFI"
            }
        });

        let info = parse_fastfetch_output(&[module]);
        let bios = info.bios.unwrap();
        assert_eq!(bios.vendor.as_deref(), Some("American Megatrends Inc."));
        assert_eq!(bios.version.as_deref(), Some("1.60"));
        assert_eq!(bios.bios_type.as_deref(), Some("UEFI"));
    }

    #[test]
    fn test_parse_disk_module() {
        let module = serde_json::json!({
            "type": "Disk",
            "result": [{
                "mountFrom": "/dev/sda1",
                "mountpoint": "/",
                "filesystem": "ext4",
                "bytes": { "total": 500107862016_u64, "used": 200000000000_u64, "available": 300107862016_u64, "free": 300107862016_u64 }
            }]
        });

        let info = parse_fastfetch_output(&[module]);
        let disks = info.storage.unwrap();
        assert_eq!(disks.len(), 1);
        assert_eq!(disks[0].name.as_deref(), Some("/dev/sda1"));
        assert_eq!(disks[0].total_bytes, Some(500107862016));
    }
}
