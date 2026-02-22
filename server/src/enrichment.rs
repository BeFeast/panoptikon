//! Device enrichment engine — OS fingerprinting, device type & model detection.
//!
//! Combines multiple data sources to identify devices on the network:
//! - DHCP option 60 (vendor class identifier) parsing
//! - mDNS/Bonjour service record analysis
//! - TTL-based OS fingerprinting from ping/ARP responses
//! - Apple model code → model name mapping
//! - Hostname pattern matching
//! - OUI vendor-based inference

use sqlx::SqlitePool;
use tracing::{debug, warn};

/// Result of enriching a device with OS, type, brand, and model information.
#[derive(Debug, Clone, Default)]
pub struct EnrichmentResult {
    pub os_family: Option<String>,
    pub os_version: Option<String>,
    pub device_type: Option<String>,
    pub device_model: Option<String>,
    pub device_brand: Option<String>,
    /// Which source provided the primary identification.
    pub source: String,
}

/// All available signals for enrichment.
#[derive(Debug, Clone, Default)]
pub struct EnrichmentInput {
    pub hostname: Option<String>,
    pub vendor: Option<String>,
    pub mdns_services: Option<String>,
    pub ttl: Option<u8>,
    pub dhcp_vendor_class: Option<String>,
    pub mac: String,
}

/// Run all enrichment heuristics and merge results by priority.
///
/// Priority (highest wins): DHCP > hostname > mDNS > TTL > vendor/OUI
/// If the device has `enrichment_corrected = 1`, skip automatic enrichment.
pub fn enrich(input: &EnrichmentInput) -> EnrichmentResult {
    let mut result = EnrichmentResult::default();

    // Layer 1: OUI vendor gives brand hints
    if let Some(ref vendor) = input.vendor {
        apply_vendor_hints(vendor, &mut result);
    }

    // Layer 2: TTL-based OS family (broad strokes)
    if let Some(ttl) = input.ttl {
        apply_ttl_hints(ttl, &mut result);
    }

    // Layer 3: mDNS service analysis
    if let Some(ref services) = input.mdns_services {
        apply_mdns_hints(services, &mut result);
    }

    // Layer 4: Hostname pattern matching (more specific)
    if let Some(ref hostname) = input.hostname {
        apply_hostname_hints(hostname, &mut result);
    }

    // Layer 5: DHCP vendor class identifier (most reliable automated source)
    if let Some(ref vci) = input.dhcp_vendor_class {
        apply_dhcp_hints(vci, &mut result);
    }

    // Layer 6: Apple model code lookup from hostname
    if let Some(ref hostname) = input.hostname {
        apply_apple_model_lookup(hostname, &mut result);
    }

    // Derive brand from MAC OUI if not already set
    if result.device_brand.is_none() {
        if let Some(ref vendor) = input.vendor {
            result.device_brand = infer_brand_from_vendor(vendor);
        }
    }

    if result.source.is_empty() {
        result.source = "heuristic".to_string();
    }

    result
}

/// Persist enrichment results to the database for a device.
///
/// Only updates fields that are non-None and respects `enrichment_corrected` flag.
pub async fn persist_enrichment(
    db: &SqlitePool,
    device_id: &str,
    result: &EnrichmentResult,
) -> Result<(), sqlx::Error> {
    // Check if user has manually corrected this device's enrichment
    let corrected: bool =
        sqlx::query_scalar("SELECT enrichment_corrected FROM devices WHERE id = ?")
            .bind(device_id)
            .fetch_optional(db)
            .await?
            .map(|v: i32| v != 0)
            .unwrap_or(false);

    if corrected {
        debug!(device_id, "Skipping enrichment — user has corrected this device");
        return Ok(());
    }

    sqlx::query(
        r#"UPDATE devices SET
            os_family = COALESCE(?, os_family),
            os_version = COALESCE(?, os_version),
            device_type = COALESCE(?, device_type),
            device_model = COALESCE(?, device_model),
            device_brand = COALESCE(?, device_brand),
            enrichment_source = COALESCE(?, enrichment_source),
            updated_at = datetime('now')
        WHERE id = ?"#,
    )
    .bind(&result.os_family)
    .bind(&result.os_version)
    .bind(&result.device_type)
    .bind(&result.device_model)
    .bind(&result.device_brand)
    .bind(if result.source.is_empty() {
        None
    } else {
        Some(&result.source)
    })
    .bind(device_id)
    .execute(db)
    .await?;

    Ok(())
}

// ─── DHCP Vendor Class Identifier Parsing ────────────────

/// Parse DHCP option 60 vendor class identifier to extract OS and device info.
fn apply_dhcp_hints(vci: &str, result: &mut EnrichmentResult) {
    let lower = vci.to_lowercase();

    if lower.starts_with("android-dhcp-") || lower.starts_with("android-") {
        // e.g. "android-dhcp-14", "android-dhcp-13"
        let version = lower
            .strip_prefix("android-dhcp-")
            .or_else(|| lower.strip_prefix("android-"))
            .unwrap_or("");
        result.os_family = Some("Android".to_string());
        if !version.is_empty() {
            result.os_version = Some(version.to_string());
        }
        result.device_type = Some("phone".to_string());
        result.source = "dhcp".to_string();
    } else if lower.starts_with("msft ") || lower == "msft" {
        // e.g. "MSFT 5.0"
        result.os_family = Some("Windows".to_string());
        result.source = "dhcp".to_string();
    } else if lower.contains("iphone") {
        result.os_family = Some("iOS".to_string());
        result.device_type = Some("phone".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "dhcp".to_string();
    } else if lower.contains("ipad") {
        result.os_family = Some("iPadOS".to_string());
        result.device_type = Some("tablet".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "dhcp".to_string();
    } else if lower.starts_with("dhcpcd-") {
        // Linux dhcpcd client
        result.os_family = Some("Linux".to_string());
        result.source = "dhcp".to_string();
    } else if lower == "udhcpc" || lower.starts_with("udhcpc ") {
        // BusyBox/embedded Linux
        result.os_family = Some("Linux".to_string());
        result.device_type = Some("iot".to_string());
        result.source = "dhcp".to_string();
    } else if lower.contains("linux") {
        result.os_family = Some("Linux".to_string());
        result.source = "dhcp".to_string();
    }
}

// ─── mDNS Service Analysis ──────────────────────────────

/// Analyze mDNS service records for device type and OS hints.
fn apply_mdns_hints(services: &str, result: &mut EnrichmentResult) {
    let lower = services.to_lowercase();

    // Apple mobile device
    if lower.contains("_apple-mobdev") {
        result.device_brand = Some("Apple".to_string());
        if result.device_type.is_none() {
            result.device_type = Some("phone".to_string());
        }
        result.source = "mdns".to_string();
    }

    // AirPlay → Apple TV or speaker
    if lower.contains("_airplay._tcp") || lower.contains("_raop._tcp") {
        if result.device_type.is_none() {
            result.device_type = Some("tv".to_string());
        }
    }

    // Google Cast → Chromecast / Smart TV
    if lower.contains("_googlecast._tcp") {
        if result.device_type.is_none() {
            result.device_type = Some("tv".to_string());
        }
        if result.source.is_empty() || result.source == "heuristic" {
            result.source = "mdns".to_string();
        }
    }

    // Printer services
    if lower.contains("_ipp._tcp")
        || lower.contains("_printer._tcp")
        || lower.contains("_pdl-datastream._tcp")
    {
        result.device_type = Some("printer".to_string());
        if result.source.is_empty() || result.source == "heuristic" {
            result.source = "mdns".to_string();
        }
    }

    // Spotify connect → speaker/IoT
    if lower.contains("_spotify-connect._tcp") {
        if result.device_type.is_none() {
            result.device_type = Some("iot".to_string());
        }
    }

    // SSH/SMB/NFS → server
    if lower.contains("_ssh._tcp")
        || lower.contains("_smb._tcp")
        || lower.contains("_nfs._tcp")
        || lower.contains("_sftp-ssh._tcp")
    {
        if result.device_type.is_none() {
            result.device_type = Some("server".to_string());
        }
    }

    // HomeKit → IoT
    if lower.contains("_hap._tcp") || lower.contains("_homekit._tcp") {
        if result.device_type.is_none() {
            result.device_type = Some("iot".to_string());
        }
    }

    // Companion link → Apple device (macOS/iOS)
    if lower.contains("_companion-link._tcp") {
        result.device_brand = Some("Apple".to_string());
        if result.os_family.is_none() {
            result.os_family = Some("macOS".to_string());
        }
    }
}

// ─── TTL-based OS Fingerprinting ────────────────────────

/// Infer OS family from IP TTL value.
///
/// Standard initial TTL values:
/// - 64: Linux, macOS, iOS, Android, FreeBSD
/// - 128: Windows
/// - 255: Network equipment (Cisco IOS, Solaris)
fn apply_ttl_hints(ttl: u8, result: &mut EnrichmentResult) {
    if result.os_family.is_some() {
        return; // Don't override more specific sources
    }

    match ttl {
        // TTL around 64 (within 1 hop)
        57..=64 => {
            // Could be Linux, macOS, iOS, Android — too ambiguous for os_family alone
            // but we can note it's a Unix-like system
            if result.source.is_empty() {
                result.source = "ttl".to_string();
            }
        }
        // TTL around 128 (within 1 hop)
        121..=128 => {
            result.os_family = Some("Windows".to_string());
            if result.source.is_empty() {
                result.source = "ttl".to_string();
            }
        }
        // TTL 255 — typically network equipment
        248..=255 => {
            if result.device_type.is_none() {
                result.device_type = Some("router".to_string());
            }
            if result.source.is_empty() {
                result.source = "ttl".to_string();
            }
        }
        _ => {}
    }
}

// ─── Hostname Pattern Matching ──────────────────────────

/// Extract OS and device type clues from hostname.
fn apply_hostname_hints(hostname: &str, result: &mut EnrichmentResult) {
    let lower = hostname.to_lowercase();

    // Apple devices
    if lower.contains("iphone") {
        result.os_family = Some("iOS".to_string());
        result.device_type = Some("phone".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    } else if lower.contains("ipad") {
        result.os_family = Some("iPadOS".to_string());
        result.device_type = Some("tablet".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    } else if lower.contains("macbook") || lower.contains("mbp") {
        result.os_family = Some("macOS".to_string());
        result.device_type = Some("laptop".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    } else if lower.contains("imac") {
        result.os_family = Some("macOS".to_string());
        result.device_type = Some("desktop".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    } else if lower.contains("apple-tv") || lower.contains("appletv") {
        result.os_family = Some("tvOS".to_string());
        result.device_type = Some("tv".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    } else if lower.contains("homepod") {
        result.os_family = Some("audioOS".to_string());
        result.device_type = Some("iot".to_string());
        result.device_brand = Some("Apple".to_string());
        result.source = "hostname".to_string();
    }
    // Android devices
    else if lower.contains("android")
        || lower.contains("galaxy")
        || lower.contains("pixel")
        || lower.contains("oneplus")
        || lower.contains("xiaomi")
        || lower.contains("redmi")
    {
        result.os_family = Some("Android".to_string());
        result.device_type = Some("phone".to_string());
        result.source = "hostname".to_string();

        if lower.contains("galaxy") || lower.contains("samsung") {
            result.device_brand = Some("Samsung".to_string());
        } else if lower.contains("pixel") {
            result.device_brand = Some("Google".to_string());
        } else if lower.contains("oneplus") {
            result.device_brand = Some("OnePlus".to_string());
        } else if lower.contains("xiaomi") || lower.contains("redmi") {
            result.device_brand = Some("Xiaomi".to_string());
        }
    }
    // Windows devices
    else if lower.starts_with("desktop-") || lower.starts_with("laptop-") {
        result.os_family = Some("Windows".to_string());
        result.source = "hostname".to_string();
        if lower.starts_with("desktop-") {
            result.device_type = Some("desktop".to_string());
        } else {
            result.device_type = Some("laptop".to_string());
        }
    }
    // Servers
    else if lower.contains("server")
        || lower.contains("nas")
        || lower.contains("proxmox")
        || lower.contains("truenas")
        || lower.contains("docker")
        || lower.contains("pve")
    {
        if result.device_type.is_none() {
            result.device_type = Some("server".to_string());
        }
        if result.os_family.is_none() {
            result.os_family = Some("Linux".to_string());
        }
        result.source = "hostname".to_string();
    }
    // Printers
    else if lower.contains("printer")
        || lower.contains("laserjet")
        || lower.contains("deskjet")
        || lower.contains("officejet")
    {
        result.device_type = Some("printer".to_string());
        result.source = "hostname".to_string();
    }
    // Network devices
    else if lower.contains("router")
        || lower.contains("gateway")
        || lower.contains("switch")
        || lower.contains("unifi")
        || lower.contains("ubnt")
    {
        result.device_type = Some("router".to_string());
        result.source = "hostname".to_string();
    }
    // Gaming
    else if lower.contains("playstation")
        || lower.contains("xbox")
        || lower.contains("nintendo")
        || lower.contains("switch")
    {
        result.device_type = Some("gaming".to_string());
        result.source = "hostname".to_string();
    }
    // Raspberry Pi / IoT
    else if lower.contains("raspberrypi") || lower.contains("pi-hole") || lower.contains("pihole")
    {
        result.os_family = Some("Linux".to_string());
        result.device_type = Some("server".to_string());
        result.source = "hostname".to_string();
    }
}

// ─── Vendor / OUI-based Hints ───────────────────────────

/// Infer device type and brand from OUI vendor string.
fn apply_vendor_hints(vendor: &str, result: &mut EnrichmentResult) {
    let lower = vendor.to_lowercase();

    // Apple
    if lower.contains("apple") {
        result.device_brand = Some("Apple".to_string());
    }
    // Samsung
    else if lower.contains("samsung") {
        result.device_brand = Some("Samsung".to_string());
    }
    // Network equipment
    else if lower.contains("ubiquiti")
        || lower.contains("unifi")
        || lower.contains("mikrotik")
        || lower.contains("cisco")
        || lower.contains("netgear")
        || lower.contains("tp-link")
        || lower.contains("aruba")
        || lower.contains("juniper")
        || lower.contains("fortinet")
    {
        if result.device_type.is_none() {
            result.device_type = Some("router".to_string());
        }
    }
    // Printers
    else if lower.contains("hp inc")
        || lower.contains("hewlett")
        || lower.contains("canon")
        || lower.contains("epson")
        || lower.contains("brother")
        || lower.contains("xerox")
    {
        // HP could be anything, but other printer brands are strong signals
        if !lower.contains("hp inc") && !lower.contains("hewlett") {
            if result.device_type.is_none() {
                result.device_type = Some("printer".to_string());
            }
        }
    }
    // NAS / Server brands
    else if lower.contains("synology") || lower.contains("qnap") || lower.contains("asustor") {
        result.device_type = Some("server".to_string());
    }
    // IoT
    else if lower.contains("espressif")
        || lower.contains("tuya")
        || lower.contains("shelly")
        || lower.contains("sonos")
    {
        result.device_type = Some("iot".to_string());
    }
    // TV
    else if lower.contains("roku")
        || lower.contains("vizio")
        || lower.contains("hisense")
        || lower.contains("tcl")
    {
        result.device_type = Some("tv".to_string());
    }
    // Gaming
    else if lower.contains("nintendo")
        || lower.contains("valve")
    {
        result.device_type = Some("gaming".to_string());
    }
}

/// Infer a clean brand name from the OUI vendor string.
fn infer_brand_from_vendor(vendor: &str) -> Option<String> {
    let lower = vendor.to_lowercase();

    let brand = if lower.contains("apple") {
        "Apple"
    } else if lower.contains("samsung") {
        "Samsung"
    } else if lower.contains("google") {
        "Google"
    } else if lower.contains("huawei") {
        "Huawei"
    } else if lower.contains("xiaomi") {
        "Xiaomi"
    } else if lower.contains("oneplus") {
        "OnePlus"
    } else if lower.contains("sony") {
        "Sony"
    } else if lower.contains("lg ") || lower.starts_with("lg") {
        "LG"
    } else if lower.contains("dell") {
        "Dell"
    } else if lower.contains("lenovo") {
        "Lenovo"
    } else if lower.contains("asus") {
        "ASUS"
    } else if lower.contains("intel") {
        "Intel"
    } else if lower.contains("microsoft") {
        "Microsoft"
    } else if lower.contains("amazon") {
        "Amazon"
    } else if lower.contains("ubiquiti") || lower.contains("unifi") {
        "Ubiquiti"
    } else if lower.contains("cisco") {
        "Cisco"
    } else if lower.contains("netgear") {
        "NETGEAR"
    } else if lower.contains("tp-link") || lower.contains("tplink") {
        "TP-Link"
    } else if lower.contains("synology") {
        "Synology"
    } else if lower.contains("qnap") {
        "QNAP"
    } else if lower.contains("hp inc") || lower.contains("hewlett") {
        "HP"
    } else if lower.contains("canon") {
        "Canon"
    } else if lower.contains("epson") {
        "Epson"
    } else if lower.contains("brother") {
        "Brother"
    } else if lower.contains("sonos") {
        "Sonos"
    } else if lower.contains("roku") {
        "Roku"
    } else if lower.contains("nintendo") {
        "Nintendo"
    } else if lower.contains("espressif") {
        "Espressif"
    } else {
        return None;
    };

    Some(brand.to_string())
}

// ─── Apple Model Code Lookup ────────────────────────────

/// Map Apple model identifier codes to human-readable model names.
///
/// Model codes appear in mDNS records, DHCP, and hostname patterns.
static APPLE_MODELS: &[(&str, &str)] = &[
    // iPhone models
    ("iPhone16,2", "iPhone 15 Pro Max"),
    ("iPhone16,1", "iPhone 15 Pro"),
    ("iPhone15,5", "iPhone 15 Plus"),
    ("iPhone15,4", "iPhone 15"),
    ("iPhone15,3", "iPhone 14 Pro Max"),
    ("iPhone15,2", "iPhone 14 Pro"),
    ("iPhone14,8", "iPhone 14 Plus"),
    ("iPhone14,7", "iPhone 14"),
    ("iPhone14,6", "iPhone SE 2022"),
    ("iPhone14,5", "iPhone 13"),
    ("iPhone14,4", "iPhone 13 mini"),
    ("iPhone14,3", "iPhone 13 Pro Max"),
    ("iPhone14,2", "iPhone 13 Pro"),
    ("iPhone13,4", "iPhone 12 Pro Max"),
    ("iPhone13,3", "iPhone 12 Pro"),
    ("iPhone13,2", "iPhone 12"),
    ("iPhone13,1", "iPhone 12 mini"),
    ("iPhone12,8", "iPhone SE 2020"),
    ("iPhone12,5", "iPhone 11 Pro Max"),
    ("iPhone12,3", "iPhone 11 Pro"),
    ("iPhone12,1", "iPhone 11"),
    // iPad models
    ("iPad14,6", "iPad Pro 12.9-inch (6th gen)"),
    ("iPad14,5", "iPad Pro 12.9-inch (6th gen)"),
    ("iPad14,4", "iPad Pro 11-inch (4th gen)"),
    ("iPad14,3", "iPad Pro 11-inch (4th gen)"),
    ("iPad13,19", "iPad (10th gen)"),
    ("iPad13,18", "iPad (10th gen)"),
    ("iPad14,2", "iPad mini (6th gen)"),
    ("iPad14,1", "iPad mini (6th gen)"),
    ("iPad13,17", "iPad Air (5th gen)"),
    ("iPad13,16", "iPad Air (5th gen)"),
    // Mac models
    ("Mac14,7", "MacBook Pro 13-inch M2"),
    ("Mac14,2", "MacBook Air M2"),
    ("Mac14,15", "MacBook Air 15-inch M2"),
    ("Mac14,6", "MacBook Pro 16-inch M2 Pro/Max"),
    ("Mac14,10", "MacBook Pro 14-inch M2 Pro/Max"),
    ("Mac14,3", "Mac mini M2"),
    ("Mac14,13", "Mac Studio M2 Max/Ultra"),
    ("Mac14,8", "Mac Pro M2 Ultra"),
    ("Mac15,3", "MacBook Pro 14-inch M3"),
    ("Mac15,6", "MacBook Pro 14-inch M3 Pro/Max"),
    ("Mac15,7", "MacBook Pro 14-inch M3 Pro/Max"),
    ("Mac15,10", "MacBook Pro 16-inch M3 Pro/Max"),
    ("Mac15,11", "MacBook Pro 16-inch M3 Pro/Max"),
    ("Mac15,12", "MacBook Air 13-inch M3"),
    ("Mac15,13", "MacBook Air 15-inch M3"),
    // Apple TV
    ("AppleTV11,1", "Apple TV 4K (3rd gen)"),
    ("AppleTV6,2", "Apple TV 4K (2nd gen)"),
    ("AppleTV5,3", "Apple TV 4K"),
    // HomePod
    ("AudioAccessory6,1", "HomePod (2nd gen)"),
    ("AudioAccessory5,1", "HomePod mini"),
];

/// Try to extract an Apple model code from a hostname and look up the model name.
fn apply_apple_model_lookup(hostname: &str, result: &mut EnrichmentResult) {
    // Apple model codes appear as e.g. "iPhone14,6" in hostnames
    for &(code, name) in APPLE_MODELS {
        if hostname.contains(code) {
            result.device_model = Some(name.to_string());
            result.device_brand = Some("Apple".to_string());

            // Infer device type from model code prefix
            if code.starts_with("iPhone") {
                result.os_family = Some("iOS".to_string());
                result.device_type = Some("phone".to_string());
            } else if code.starts_with("iPad") {
                result.os_family = Some("iPadOS".to_string());
                result.device_type = Some("tablet".to_string());
            } else if code.starts_with("Mac") {
                result.os_family = Some("macOS".to_string());
                if name.contains("MacBook") {
                    result.device_type = Some("laptop".to_string());
                } else {
                    result.device_type = Some("desktop".to_string());
                }
            } else if code.starts_with("AppleTV") {
                result.os_family = Some("tvOS".to_string());
                result.device_type = Some("tv".to_string());
            } else if code.starts_with("AudioAccessory") {
                result.os_family = Some("audioOS".to_string());
                result.device_type = Some("iot".to_string());
            }

            result.source = "model_db".to_string();
            return;
        }
    }
}

/// Enrich a device in the database by gathering all available signals.
///
/// Called during scan processing after a device is upserted.
pub async fn enrich_device(
    db: &SqlitePool,
    device_id: &str,
    _ip: &str,
    mac: &str,
    hostname: Option<&str>,
    vendor: Option<&str>,
    mdns_services: Option<&str>,
    ttl: Option<u8>,
) {
    let input = EnrichmentInput {
        hostname: hostname.map(|s| s.to_string()),
        vendor: vendor.map(|s| s.to_string()),
        mdns_services: mdns_services.map(|s| s.to_string()),
        ttl,
        dhcp_vendor_class: None, // TODO: integrate when DHCP snooping is available
        mac: mac.to_string(),
    };

    let result = enrich(&input);

    // Only persist if we actually learned something
    if result.os_family.is_some()
        || result.device_type.is_some()
        || result.device_model.is_some()
        || result.device_brand.is_some()
    {
        if let Err(e) = persist_enrichment(db, device_id, &result).await {
            warn!(device_id, error = %e, "Failed to persist enrichment");
        } else {
            debug!(
                device_id,
                os = ?result.os_family,
                dtype = ?result.device_type,
                model = ?result.device_model,
                brand = ?result.device_brand,
                source = %result.source,
                "Device enriched"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dhcp_android() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("android-dhcp-14".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.os_version.as_deref(), Some("14"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
        assert_eq!(result.source, "dhcp");
    }

    #[test]
    fn test_dhcp_windows() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("MSFT 5.0".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
        assert_eq!(result.source, "dhcp");
    }

    #[test]
    fn test_dhcp_iphone() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("iPhone".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_dhcp_linux_dhcpcd() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("dhcpcd-9.4.1".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
    }

    #[test]
    fn test_dhcp_embedded_linux() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("udhcpc".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_ttl_windows() {
        let input = EnrichmentInput {
            ttl: Some(128),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
        assert_eq!(result.source, "ttl");
    }

    #[test]
    fn test_ttl_network_device() {
        let input = EnrichmentInput {
            ttl: Some(255),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
    }

    #[test]
    fn test_ttl_does_not_override_dhcp() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("android-dhcp-14".to_string()),
            ttl: Some(128), // Would suggest Windows, but DHCP says Android
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
    }

    #[test]
    fn test_hostname_iphone() {
        let input = EnrichmentInput {
            hostname: Some("Bernadettes-iPhone".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_hostname_macbook() {
        let input = EnrichmentInput {
            hostname: Some("Johns-MacBook-Pro".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_hostname_galaxy() {
        let input = EnrichmentInput {
            hostname: Some("Galaxy-S23-Ultra".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("Samsung"));
    }

    #[test]
    fn test_hostname_windows_desktop() {
        let input = EnrichmentInput {
            hostname: Some("DESKTOP-ABC123".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
        assert_eq!(result.device_type.as_deref(), Some("desktop"));
    }

    #[test]
    fn test_mdns_printer() {
        let input = EnrichmentInput {
            mdns_services: Some("_ipp._tcp,_http._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
    }

    #[test]
    fn test_mdns_apple_mobile() {
        let input = EnrichmentInput {
            mdns_services: Some("_apple-mobdev2._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
    }

    #[test]
    fn test_mdns_googlecast() {
        let input = EnrichmentInput {
            mdns_services: Some("_googlecast._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("tv"));
    }

    #[test]
    fn test_vendor_ubiquiti() {
        let input = EnrichmentInput {
            vendor: Some("Ubiquiti Inc".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
        assert_eq!(result.device_brand.as_deref(), Some("Ubiquiti"));
    }

    #[test]
    fn test_vendor_espressif() {
        let input = EnrichmentInput {
            vendor: Some("Espressif Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("iot"));
        assert_eq!(result.device_brand.as_deref(), Some("Espressif"));
    }

    #[test]
    fn test_apple_model_iphone_se() {
        let input = EnrichmentInput {
            hostname: Some("iPhone14,6".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_model.as_deref(), Some("iPhone SE 2022"));
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_apple_model_macbook_pro_m3() {
        let input = EnrichmentInput {
            hostname: Some("Mac15,6".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(
            result.device_model.as_deref(),
            Some("MacBook Pro 14-inch M3 Pro/Max")
        );
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
    }

    #[test]
    fn test_combined_enrichment() {
        // Realistic scenario: Apple device with vendor OUI + hostname + mDNS
        let input = EnrichmentInput {
            hostname: Some("Bernadettes-iPhone".to_string()),
            vendor: Some("Apple, Inc.".to_string()),
            mdns_services: Some("_apple-mobdev2._tcp,_airplay._tcp".to_string()),
            mac: "BE:83:28:45:3C:5A".to_string(),
            ttl: Some(64),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_brand_from_vendor() {
        assert_eq!(
            infer_brand_from_vendor("Apple, Inc."),
            Some("Apple".to_string())
        );
        assert_eq!(
            infer_brand_from_vendor("Samsung Electronics"),
            Some("Samsung".to_string())
        );
        assert_eq!(infer_brand_from_vendor("Unknown Vendor"), None);
    }

    #[tokio::test]
    async fn test_persist_enrichment_basic() {
        let pool = crate::db::init(":memory:").await.unwrap();

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO devices (id, mac, first_seen_at, last_seen_at) VALUES (?, 'aa:bb:cc:dd:ee:ff', ?, ?)",
        )
        .bind(&id)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let result = EnrichmentResult {
            os_family: Some("iOS".to_string()),
            device_type: Some("phone".to_string()),
            device_brand: Some("Apple".to_string()),
            device_model: Some("iPhone SE 2022".to_string()),
            source: "hostname".to_string(),
            ..Default::default()
        };

        persist_enrichment(&pool, &id, &result).await.unwrap();

        let row = sqlx::query(
            "SELECT os_family, device_type, device_brand, device_model, enrichment_source FROM devices WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();

        let os: Option<String> = sqlx::Row::get(&row, "os_family");
        let dtype: Option<String> = sqlx::Row::get(&row, "device_type");
        let brand: Option<String> = sqlx::Row::get(&row, "device_brand");
        let model: Option<String> = sqlx::Row::get(&row, "device_model");
        let source: Option<String> = sqlx::Row::get(&row, "enrichment_source");

        assert_eq!(os.as_deref(), Some("iOS"));
        assert_eq!(dtype.as_deref(), Some("phone"));
        assert_eq!(brand.as_deref(), Some("Apple"));
        assert_eq!(model.as_deref(), Some("iPhone SE 2022"));
        assert_eq!(source.as_deref(), Some("hostname"));
    }

    #[tokio::test]
    async fn test_persist_enrichment_skips_corrected() {
        let pool = crate::db::init(":memory:").await.unwrap();

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO devices (id, mac, first_seen_at, last_seen_at, os_family, enrichment_corrected) VALUES (?, 'aa:bb:cc:dd:ee:ff', ?, ?, 'Windows', 1)",
        )
        .bind(&id)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let result = EnrichmentResult {
            os_family: Some("Linux".to_string()),
            source: "dhcp".to_string(),
            ..Default::default()
        };

        persist_enrichment(&pool, &id, &result).await.unwrap();

        // Should still be Windows (user correction preserved)
        let os: Option<String> =
            sqlx::query_scalar("SELECT os_family FROM devices WHERE id = ?")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(os.as_deref(), Some("Windows"));
    }
}
