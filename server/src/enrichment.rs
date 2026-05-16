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

/// Check if a MAC address is locally administered (randomized).
///
/// The second-least-significant bit of the first octet indicates a locally
/// administered address. Devices with randomized MACs (iOS 14+, Android 10+,
/// Windows 10+) set this bit. OUI lookups are meaningless for such addresses.
pub fn is_randomized_mac(mac: &str) -> bool {
    // Strip separators and parse first octet.
    let clean: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.len() < 2 {
        return false;
    }
    match u8::from_str_radix(&clean[..2], 16) {
        Ok(first_byte) => (first_byte & 0x02) != 0,
        Err(_) => false,
    }
}

/// Run all enrichment heuristics and merge results by priority.
///
/// Priority (highest wins): DHCP > hostname > mDNS > TTL > vendor/OUI
/// If the device has `enrichment_corrected = 1`, skip automatic enrichment.
pub fn enrich(input: &EnrichmentInput) -> EnrichmentResult {
    let mut result = EnrichmentResult::default();
    let mac_randomized = is_randomized_mac(&input.mac);

    // Layer 1: OUI vendor gives brand hints (skip for randomized MACs)
    if !mac_randomized {
        if let Some(ref vendor) = input.vendor {
            apply_vendor_hints(vendor, &mut result);
        }
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

    // Derive brand from MAC OUI if not already set (skip for randomized MACs)
    if result.device_brand.is_none() && !mac_randomized {
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
        debug!(
            device_id,
            "Skipping enrichment — user has corrected this device"
        );
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
            is_known = 1,
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
    if (lower.contains("_airplay._tcp") || lower.contains("_raop._tcp"))
        && result.device_type.is_none()
    {
        result.device_type = Some("tv".to_string());
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
    if lower.contains("_spotify-connect._tcp") && result.device_type.is_none() {
        result.device_type = Some("iot".to_string());
    }

    // SSH/SMB/NFS → server
    if (lower.contains("_ssh._tcp")
        || lower.contains("_smb._tcp")
        || lower.contains("_nfs._tcp")
        || lower.contains("_sftp-ssh._tcp"))
        && result.device_type.is_none()
    {
        result.device_type = Some("server".to_string());
    }

    // HomeKit → IoT
    if (lower.contains("_hap._tcp") || lower.contains("_homekit._tcp"))
        && result.device_type.is_none()
    {
        result.device_type = Some("iot".to_string());
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
        57..=64 if result.source.is_empty() => {
            // Could be Linux, macOS, iOS, Android — too ambiguous for os_family alone
            // but we can note it's a Unix-like system
            result.source = "ttl".to_string();
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
        if !lower.contains("hp inc") && !lower.contains("hewlett") && result.device_type.is_none() {
            result.device_type = Some("printer".to_string());
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
    else if lower.contains("nintendo") || lower.contains("valve") {
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
#[allow(clippy::too_many_arguments)]
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
    fn test_randomized_mac_detected() {
        // Locally administered bit set (0x02 in first octet)
        assert!(is_randomized_mac("02:00:00:00:00:00"));
        assert!(is_randomized_mac("06:AB:CD:EF:12:34"));
        assert!(is_randomized_mac("0A:00:00:00:00:00"));
        assert!(is_randomized_mac("0E:00:00:00:00:00"));
        assert!(is_randomized_mac("BE:83:28:45:3C:5A")); // 0xBE = 1011_1110, bit 1 set
        assert!(is_randomized_mac("DA:A1:19:00:00:00")); // 0xDA = 1101_1010, bit 1 set
    }

    #[test]
    fn test_non_randomized_mac() {
        // Normal OUI MACs (locally administered bit NOT set)
        assert!(!is_randomized_mac("00:11:22:33:44:55"));
        assert!(!is_randomized_mac("AC:DE:48:00:11:22")); // 0xAC = 1010_1100, bit 1 = 0
        assert!(!is_randomized_mac("28:6F:B9:00:00:00")); // Nokia OUI
        assert!(!is_randomized_mac("DC:A6:32:00:00:00")); // Raspberry Pi
    }

    #[test]
    fn test_randomized_mac_skips_vendor_hints() {
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            mac: "DA:A1:19:00:00:00".to_string(), // randomized MAC
            ..Default::default()
        };
        let result = enrich(&input);
        // Vendor hints should be skipped for randomized MACs
        assert!(
            result.device_brand.is_none(),
            "Brand should not be set from OUI for randomized MAC"
        );
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
        let os: Option<String> = sqlx::query_scalar("SELECT os_family FROM devices WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(os.as_deref(), Some("Windows"));
    }

    // ─── Brand detection from MAC OUI ────────────────────────

    #[test]
    fn test_vendor_apple_brand() {
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_vendor_samsung_brand() {
        let input = EnrichmentInput {
            vendor: Some("Samsung Electronics Co.,Ltd".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_brand.as_deref(), Some("Samsung"));
    }

    #[test]
    fn test_vendor_cisco_brand_and_type() {
        let input = EnrichmentInput {
            vendor: Some("Cisco Systems, Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
        assert_eq!(result.device_brand.as_deref(), Some("Cisco"));
    }

    #[test]
    fn test_vendor_netgear() {
        let input = EnrichmentInput {
            vendor: Some("NETGEAR".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
        assert_eq!(result.device_brand.as_deref(), Some("NETGEAR"));
    }

    #[test]
    fn test_vendor_tplink() {
        let input = EnrichmentInput {
            vendor: Some("TP-Link Technologies Co.,Ltd.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
        assert_eq!(result.device_brand.as_deref(), Some("TP-Link"));
    }

    #[test]
    fn test_vendor_mikrotik() {
        let input = EnrichmentInput {
            vendor: Some("MikroTik".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
    }

    #[test]
    fn test_vendor_synology_nas() {
        let input = EnrichmentInput {
            vendor: Some("Synology Incorporated".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
        assert_eq!(result.device_brand.as_deref(), Some("Synology"));
    }

    #[test]
    fn test_vendor_qnap_nas() {
        let input = EnrichmentInput {
            vendor: Some("QNAP Systems, Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
        assert_eq!(result.device_brand.as_deref(), Some("QNAP"));
    }

    #[test]
    fn test_vendor_roku_tv() {
        let input = EnrichmentInput {
            vendor: Some("Roku, Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("tv"));
        assert_eq!(result.device_brand.as_deref(), Some("Roku"));
    }

    #[test]
    fn test_vendor_nintendo_gaming() {
        let input = EnrichmentInput {
            vendor: Some("Nintendo Co.,Ltd".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("gaming"));
        assert_eq!(result.device_brand.as_deref(), Some("Nintendo"));
    }

    #[test]
    fn test_vendor_tuya_iot() {
        let input = EnrichmentInput {
            vendor: Some("Tuya Smart Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_vendor_sonos_iot() {
        let input = EnrichmentInput {
            vendor: Some("Sonos, Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("iot"));
        assert_eq!(result.device_brand.as_deref(), Some("Sonos"));
    }

    #[test]
    fn test_vendor_canon_printer() {
        let input = EnrichmentInput {
            vendor: Some("Canon Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
        assert_eq!(result.device_brand.as_deref(), Some("Canon"));
    }

    #[test]
    fn test_vendor_epson_printer() {
        let input = EnrichmentInput {
            vendor: Some("Seiko Epson Corporation".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
        assert_eq!(result.device_brand.as_deref(), Some("Epson"));
    }

    #[test]
    fn test_vendor_brother_printer() {
        let input = EnrichmentInput {
            vendor: Some("Brother Industries, Ltd.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
        assert_eq!(result.device_brand.as_deref(), Some("Brother"));
    }

    #[test]
    fn test_vendor_hp_no_type_inference() {
        // HP could be anything (laptop, printer, server) so no type should be inferred
        let input = EnrichmentInput {
            vendor: Some("HP Inc.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert!(
            result.device_type.is_none(),
            "HP vendor should not assume device type"
        );
        assert_eq!(result.device_brand.as_deref(), Some("HP"));
    }

    #[test]
    fn test_vendor_valve_gaming() {
        let input = EnrichmentInput {
            vendor: Some("Valve Corporation".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("gaming"));
    }

    #[test]
    fn test_vendor_unknown_no_brand() {
        let input = EnrichmentInput {
            vendor: Some("Some Random OEM Corp.".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert!(result.device_brand.is_none());
    }

    // ─── Brand inference from vendor string ──────────────────

    #[test]
    fn test_brand_inference_google() {
        assert_eq!(
            infer_brand_from_vendor("Google LLC"),
            Some("Google".to_string())
        );
    }

    #[test]
    fn test_brand_inference_huawei() {
        assert_eq!(
            infer_brand_from_vendor("Huawei Technologies"),
            Some("Huawei".to_string())
        );
    }

    #[test]
    fn test_brand_inference_xiaomi() {
        assert_eq!(
            infer_brand_from_vendor("Xiaomi Communications Co Ltd"),
            Some("Xiaomi".to_string())
        );
    }

    #[test]
    fn test_brand_inference_sony() {
        assert_eq!(
            infer_brand_from_vendor("Sony Corporation"),
            Some("Sony".to_string())
        );
    }

    #[test]
    fn test_brand_inference_lg() {
        assert_eq!(
            infer_brand_from_vendor("LG Electronics"),
            Some("LG".to_string())
        );
    }

    #[test]
    fn test_brand_inference_dell() {
        assert_eq!(
            infer_brand_from_vendor("Dell Inc."),
            Some("Dell".to_string())
        );
    }

    #[test]
    fn test_brand_inference_lenovo() {
        assert_eq!(
            infer_brand_from_vendor("Lenovo Group Limited"),
            Some("Lenovo".to_string())
        );
    }

    #[test]
    fn test_brand_inference_asus() {
        assert_eq!(
            infer_brand_from_vendor("ASUSTek COMPUTER INC."),
            Some("ASUS".to_string())
        );
    }

    #[test]
    fn test_brand_inference_intel() {
        assert_eq!(
            infer_brand_from_vendor("Intel Corporate"),
            Some("Intel".to_string())
        );
    }

    #[test]
    fn test_brand_inference_microsoft() {
        assert_eq!(
            infer_brand_from_vendor("Microsoft Corporation"),
            Some("Microsoft".to_string())
        );
    }

    #[test]
    fn test_brand_inference_amazon() {
        assert_eq!(
            infer_brand_from_vendor("Amazon Technologies Inc."),
            Some("Amazon".to_string())
        );
    }

    #[test]
    fn test_brand_inference_tplink_variant() {
        assert_eq!(
            infer_brand_from_vendor("TPLink Technologies"),
            Some("TP-Link".to_string())
        );
    }

    // ─── OS detection from hostname heuristics ───────────────

    #[test]
    fn test_hostname_ipad() {
        let input = EnrichmentInput {
            hostname: Some("Johns-iPad".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iPadOS"));
        assert_eq!(result.device_type.as_deref(), Some("tablet"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
        assert_eq!(result.source, "hostname");
    }

    #[test]
    fn test_hostname_imac() {
        let input = EnrichmentInput {
            hostname: Some("Office-iMac".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
        assert_eq!(result.device_type.as_deref(), Some("desktop"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_hostname_apple_tv() {
        let input = EnrichmentInput {
            hostname: Some("Living-Room-Apple-TV".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("tvOS"));
        assert_eq!(result.device_type.as_deref(), Some("tv"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_hostname_homepod() {
        let input = EnrichmentInput {
            hostname: Some("Kitchen-HomePod".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("audioOS"));
        assert_eq!(result.device_type.as_deref(), Some("iot"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_hostname_pixel() {
        let input = EnrichmentInput {
            hostname: Some("Pixel-8-Pro".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("Google"));
    }

    #[test]
    fn test_hostname_oneplus() {
        let input = EnrichmentInput {
            hostname: Some("OnePlus-12".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("OnePlus"));
    }

    #[test]
    fn test_hostname_xiaomi() {
        let input = EnrichmentInput {
            hostname: Some("Xiaomi-14-Ultra".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("Xiaomi"));
    }

    #[test]
    fn test_hostname_redmi() {
        let input = EnrichmentInput {
            hostname: Some("Redmi-Note-13".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("Xiaomi"));
    }

    #[test]
    fn test_hostname_windows_laptop() {
        let input = EnrichmentInput {
            hostname: Some("LAPTOP-XYZ789".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
    }

    #[test]
    fn test_hostname_nas_server() {
        let input = EnrichmentInput {
            hostname: Some("home-nas".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
    }

    #[test]
    fn test_hostname_proxmox() {
        let input = EnrichmentInput {
            hostname: Some("proxmox-node1".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
    }

    #[test]
    fn test_hostname_docker() {
        let input = EnrichmentInput {
            hostname: Some("docker-host".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
    }

    #[test]
    fn test_hostname_printer_laserjet() {
        let input = EnrichmentInput {
            hostname: Some("HP-LaserJet-Pro".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
        assert_eq!(result.source, "hostname");
    }

    #[test]
    fn test_hostname_network_router() {
        let input = EnrichmentInput {
            hostname: Some("home-router".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
    }

    #[test]
    fn test_hostname_unifi_device() {
        let input = EnrichmentInput {
            hostname: Some("UniFi-AP-Pro".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
    }

    #[test]
    fn test_hostname_playstation() {
        let input = EnrichmentInput {
            hostname: Some("PlayStation-5".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("gaming"));
    }

    #[test]
    fn test_hostname_xbox() {
        let input = EnrichmentInput {
            hostname: Some("Xbox-Series-X".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("gaming"));
    }

    #[test]
    fn test_hostname_raspberrypi() {
        let input = EnrichmentInput {
            hostname: Some("raspberrypi".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
        assert_eq!(result.device_type.as_deref(), Some("server"));
    }

    #[test]
    fn test_hostname_pihole() {
        let input = EnrichmentInput {
            hostname: Some("pi-hole".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
        assert_eq!(result.device_type.as_deref(), Some("server"));
    }

    // ─── Device type classification from mDNS ───────────────

    #[test]
    fn test_mdns_airplay() {
        let input = EnrichmentInput {
            mdns_services: Some("_airplay._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("tv"));
    }

    #[test]
    fn test_mdns_raop() {
        let input = EnrichmentInput {
            mdns_services: Some("_raop._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("tv"));
    }

    #[test]
    fn test_mdns_spotify_connect() {
        let input = EnrichmentInput {
            mdns_services: Some("_spotify-connect._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_mdns_ssh_server() {
        let input = EnrichmentInput {
            mdns_services: Some("_ssh._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
    }

    #[test]
    fn test_mdns_smb_server() {
        let input = EnrichmentInput {
            mdns_services: Some("_smb._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("server"));
    }

    #[test]
    fn test_mdns_homekit() {
        let input = EnrichmentInput {
            mdns_services: Some("_hap._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_mdns_companion_link_apple() {
        let input = EnrichmentInput {
            mdns_services: Some("_companion-link._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
    }

    #[test]
    fn test_mdns_printer_pdl() {
        let input = EnrichmentInput {
            mdns_services: Some("_pdl-datastream._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
    }

    // ─── DHCP additional cases ───────────────────────────────

    #[test]
    fn test_dhcp_ipad() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("iPad".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iPadOS"));
        assert_eq!(result.device_type.as_deref(), Some("tablet"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_dhcp_generic_linux() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("Linux 5.10".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
    }

    #[test]
    fn test_dhcp_msft_bare() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("MSFT".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
    }

    #[test]
    fn test_dhcp_udhcpc_with_version() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("udhcpc 1.35.0".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Linux"));
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_dhcp_android_short_prefix() {
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("android-11".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
    }

    // ─── TTL edge cases ─────────────────────────────────────

    #[test]
    fn test_ttl_unix_like_64() {
        let input = EnrichmentInput {
            ttl: Some(64),
            ..Default::default()
        };
        let result = enrich(&input);
        // TTL 64 is ambiguous (Linux/macOS/iOS) — should set source but not os_family
        assert!(result.os_family.is_none());
        assert_eq!(result.source, "ttl");
    }

    #[test]
    fn test_ttl_one_hop_from_128() {
        let input = EnrichmentInput {
            ttl: Some(127),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
    }

    #[test]
    fn test_ttl_network_equipment_248() {
        let input = EnrichmentInput {
            ttl: Some(248),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
    }

    #[test]
    fn test_ttl_out_of_range_no_match() {
        let input = EnrichmentInput {
            ttl: Some(30),
            ..Default::default()
        };
        let result = enrich(&input);
        assert!(result.os_family.is_none());
        assert!(result.device_type.is_none());
    }

    // ─── Apple model lookup ──────────────────────────────────

    #[test]
    fn test_apple_model_ipad() {
        let input = EnrichmentInput {
            hostname: Some("iPad14,6".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(
            result.device_model.as_deref(),
            Some("iPad Pro 12.9-inch (6th gen)")
        );
        assert_eq!(result.os_family.as_deref(), Some("iPadOS"));
        assert_eq!(result.device_type.as_deref(), Some("tablet"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    #[test]
    fn test_apple_model_apple_tv() {
        let input = EnrichmentInput {
            hostname: Some("AppleTV11,1".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(
            result.device_model.as_deref(),
            Some("Apple TV 4K (3rd gen)")
        );
        assert_eq!(result.os_family.as_deref(), Some("tvOS"));
        assert_eq!(result.device_type.as_deref(), Some("tv"));
    }

    #[test]
    fn test_apple_model_homepod_mini() {
        let input = EnrichmentInput {
            hostname: Some("AudioAccessory5,1".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_model.as_deref(), Some("HomePod mini"));
        assert_eq!(result.os_family.as_deref(), Some("audioOS"));
        assert_eq!(result.device_type.as_deref(), Some("iot"));
    }

    #[test]
    fn test_apple_model_macbook_air() {
        let input = EnrichmentInput {
            hostname: Some("Mac14,2".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_model.as_deref(), Some("MacBook Air M2"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
    }

    #[test]
    fn test_apple_model_mac_mini() {
        let input = EnrichmentInput {
            hostname: Some("Mac14,3".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_model.as_deref(), Some("Mac mini M2"));
        assert_eq!(result.device_type.as_deref(), Some("desktop"));
    }

    // ─── Enrichment merging (multiple sources) ──────────────

    #[test]
    fn test_merge_vendor_plus_hostname() {
        // Vendor sets brand, hostname overrides with more specific info
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            hostname: Some("Johns-MacBook-Pro".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
        assert_eq!(result.source, "hostname");
    }

    #[test]
    fn test_merge_ttl_plus_hostname() {
        // TTL says Windows, hostname says Galaxy (Android) — hostname wins
        let input = EnrichmentInput {
            ttl: Some(64),
            hostname: Some("Galaxy-S24".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.device_brand.as_deref(), Some("Samsung"));
        assert_eq!(result.source, "hostname");
    }

    #[test]
    fn test_merge_mdns_plus_hostname() {
        // mDNS indicates printer, hostname confirms
        let input = EnrichmentInput {
            mdns_services: Some("_ipp._tcp,_printer._tcp".to_string()),
            hostname: Some("Office-Printer".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("printer"));
    }

    #[test]
    fn test_merge_all_layers_apple_device() {
        // Full Apple device with all data sources
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            hostname: Some("iPhone15,4".to_string()),
            mdns_services: Some("_apple-mobdev2._tcp,_companion-link._tcp".to_string()),
            ttl: Some(64),
            mac: "AC:DE:48:00:11:22".to_string(), // non-randomized
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_model.as_deref(), Some("iPhone 15"));
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
        assert_eq!(result.device_type.as_deref(), Some("phone"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
        assert_eq!(result.source, "model_db");
    }

    #[test]
    fn test_merge_dhcp_overrides_hostname_for_os() {
        // DHCP says Android, hostname is generic — DHCP wins for OS
        let input = EnrichmentInput {
            dhcp_vendor_class: Some("android-dhcp-14".to_string()),
            hostname: Some("my-device".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Android"));
        assert_eq!(result.source, "dhcp");
    }

    #[test]
    fn test_merge_vendor_brand_fallback() {
        // When no other source sets brand, vendor OUI sets it
        let input = EnrichmentInput {
            vendor: Some("Dell Inc.".to_string()),
            ttl: Some(128),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("Windows"));
        assert_eq!(result.device_brand.as_deref(), Some("Dell"));
    }

    #[test]
    fn test_merge_randomized_mac_ignores_vendor() {
        // Randomized MAC should skip vendor hints and brand from OUI
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            hostname: Some("generic-host".to_string()),
            mac: "02:00:00:00:00:00".to_string(), // randomized
            ..Default::default()
        };
        let result = enrich(&input);
        assert!(
            result.device_brand.is_none(),
            "Brand should not be inferred from vendor for randomized MAC"
        );
    }

    #[test]
    fn test_merge_randomized_mac_with_hostname() {
        // Randomized MAC skips vendor, but hostname still works
        let input = EnrichmentInput {
            vendor: Some("Apple, Inc.".to_string()),
            hostname: Some("Johns-MacBook-Pro".to_string()),
            mac: "DA:A1:19:00:00:00".to_string(), // randomized
            ..Default::default()
        };
        let result = enrich(&input);
        // Hostname still identifies the device despite randomized MAC
        assert_eq!(result.os_family.as_deref(), Some("macOS"));
        assert_eq!(result.device_type.as_deref(), Some("laptop"));
        assert_eq!(result.device_brand.as_deref(), Some("Apple"));
    }

    // ─── Edge cases ─────────────────────────────────────────

    #[test]
    fn test_empty_input_returns_default() {
        let input = EnrichmentInput::default();
        let result = enrich(&input);
        assert!(result.os_family.is_none());
        assert!(result.os_version.is_none());
        assert!(result.device_type.is_none());
        assert!(result.device_model.is_none());
        assert!(result.device_brand.is_none());
        assert_eq!(result.source, "heuristic");
    }

    #[test]
    fn test_randomized_mac_empty_string() {
        assert!(!is_randomized_mac(""));
    }

    #[test]
    fn test_randomized_mac_short_input() {
        assert!(!is_randomized_mac("A"));
    }

    #[test]
    fn test_randomized_mac_no_separators() {
        // MAC without colons — 020000000000
        assert!(is_randomized_mac("020000000000"));
    }

    #[test]
    fn test_randomized_mac_dash_separator() {
        assert!(is_randomized_mac("02-00-00-00-00-00"));
    }

    #[test]
    fn test_mdns_does_not_override_existing_type() {
        // If hostname already set device_type, mDNS should not override for _airplay
        let input = EnrichmentInput {
            hostname: Some("Bernadettes-iPhone".to_string()),
            mdns_services: Some("_airplay._tcp".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        // Hostname sets phone first (layer 4), mDNS airplay checks device_type.is_none()
        assert_eq!(result.device_type.as_deref(), Some("phone"));
    }

    #[test]
    fn test_ttl_does_not_override_existing_os() {
        // If hostname sets os_family, TTL should not override
        let input = EnrichmentInput {
            hostname: Some("Bernadettes-iPhone".to_string()),
            ttl: Some(128), // would suggest Windows
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.os_family.as_deref(), Some("iOS"));
    }

    #[test]
    fn test_hostname_server_respects_existing_type() {
        // Vendor sets router (layer 1), hostname "server" pattern uses is_none() guard
        // so the vendor's router classification persists
        let input = EnrichmentInput {
            vendor: Some("Ubiquiti Inc".to_string()),
            hostname: Some("nas-server".to_string()),
            ..Default::default()
        };
        let result = enrich(&input);
        assert_eq!(result.device_type.as_deref(), Some("router"));
        assert_eq!(result.device_brand.as_deref(), Some("Ubiquiti"));
    }
}
