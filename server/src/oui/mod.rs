/// MAC address vendor lookup (OUI — Organizationally Unique Identifier).
///
/// In the future, this will embed the IEEE MA-L database at compile time.
/// For now, it provides a stub implementation with a handful of common vendors.
use std::collections::HashMap;
use std::sync::LazyLock;

/// Static mapping of common MAC prefixes to vendor names.
/// This is a placeholder — the real implementation will embed the full IEEE OUI database.
static OUI_DB: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("00:50:56", "VMware");
    m.insert("00:0C:29", "VMware");
    m.insert("52:54:00", "QEMU/KVM");
    m.insert("08:00:27", "VirtualBox");
    m.insert("DC:A6:32", "Raspberry Pi");
    m.insert("B8:27:EB", "Raspberry Pi");
    m.insert("E4:5F:01", "Raspberry Pi");
    m.insert("AA:BB:CC", "Apple, Inc."); // Placeholder
    m.insert("3C:22:FB", "Apple, Inc.");
    m.insert("F8:FF:C2", "Apple, Inc.");
    m.insert("A4:83:E7", "Apple, Inc.");
    m.insert("60:03:08", "Apple, Inc.");
    m.insert("AC:DE:48", "Apple, Inc.");
    m.insert("28:6C:07", "XIAOMI");
    m.insert("7C:49:EB", "Samsung");
    m.insert("E8:6F:38", "TP-Link");
    m.insert("30:B5:C2", "TP-Link");
    m.insert("B0:BE:76", "TP-Link");
    m.insert("3C:84:6A", "TP-Link");
    m.insert("FC:EC:DA", "Ubiquiti");
    m.insert("80:2A:A8", "Ubiquiti");
    m.insert("68:D7:9A", "Ubiquiti");
    m
});

/// Look up the vendor name for a given MAC address.
///
/// Returns `None` if the MAC prefix is not in the database.
pub fn lookup(mac: &str) -> Option<&'static str> {
    // Normalize: uppercase, colon-separated.
    let mac_upper = mac.to_uppercase();

    // Try the first 3 octets (OUI-24, most common).
    if mac_upper.len() >= 8 {
        let prefix = &mac_upper[..8]; // "AA:BB:CC"
        if let Some(vendor) = OUI_DB.get(prefix) {
            return Some(vendor);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_vendor() {
        assert_eq!(lookup("52:54:00:12:34:56"), Some("QEMU/KVM"));
        assert_eq!(lookup("dc:a6:32:ab:cd:ef"), Some("Raspberry Pi"));
    }

    #[test]
    fn test_unknown_vendor() {
        assert_eq!(lookup("FF:FF:FF:FF:FF:FF"), None);
    }
}
