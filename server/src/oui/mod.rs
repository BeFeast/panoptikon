/// MAC address vendor lookup (OUI — Organizationally Unique Identifier).
///
/// Embeds the IEEE MA-L (Manufacturer Assignment - Large) database at compile time.
/// The database is a trimmed TSV file with ~39k entries mapping 3-byte OUI prefixes
/// to vendor names.
use std::collections::HashMap;
use std::sync::OnceLock;

/// Raw OUI database embedded at compile time.
/// Format: one line per entry, `HEXPREFIX\tVendorName\n` (e.g., `001122\tAcme Corp\n`).
static OUI_RAW: &str = include_str!("oui_db.csv");

/// Parsed OUI database: maps 3-byte prefix to vendor name.
static OUI_DB: OnceLock<HashMap<[u8; 3], String>> = OnceLock::new();

/// Parse a hex character to its nibble value.
fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'A'..=b'F' => Some(b - b'A' + 10),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

/// Parse a 6-character hex string into 3 bytes.
fn parse_hex_prefix(s: &str) -> Option<[u8; 3]> {
    let b = s.as_bytes();
    if b.len() != 6 {
        return None;
    }
    Some([
        (hex_nibble(b[0])? << 4) | hex_nibble(b[1])?,
        (hex_nibble(b[2])? << 4) | hex_nibble(b[3])?,
        (hex_nibble(b[4])? << 4) | hex_nibble(b[5])?,
    ])
}

/// Initialize the OUI database from the embedded data.
fn init_db() -> HashMap<[u8; 3], String> {
    let mut map = HashMap::with_capacity(OUI_RAW.lines().count());
    for line in OUI_RAW.lines() {
        if let Some((hex, vendor)) = line.split_once('\t') {
            if let Some(prefix) = parse_hex_prefix(hex.trim()) {
                let vendor = vendor.trim();
                if !vendor.is_empty() {
                    map.insert(prefix, vendor.to_string());
                }
            }
        }
    }
    map
}

/// Extract the 3-byte OUI prefix from a MAC address string.
///
/// Supports formats:
/// - Colon-separated: `aa:bb:cc:dd:ee:ff`
/// - Dash-separated: `aa-bb-cc-dd-ee-ff`
/// - No separator: `aabbccddeeff`
///
/// Allocation-free: collects only the first 6 hex digits into a fixed array.
fn extract_oui_bytes(mac: &str) -> Option<[u8; 3]> {
    let mut buf = [0u8; 6];
    let mut count = 0usize;
    for b in mac.bytes() {
        if b.is_ascii_hexdigit() {
            if count == 6 {
                break;
            }
            buf[count] = b;
            count += 1;
        }
    }
    if count < 6 {
        return None;
    }
    Some([
        (hex_nibble(buf[0])? << 4) | hex_nibble(buf[1])?,
        (hex_nibble(buf[2])? << 4) | hex_nibble(buf[3])?,
        (hex_nibble(buf[4])? << 4) | hex_nibble(buf[5])?,
    ])
}

/// Look up the vendor name for a given MAC address string.
///
/// Accepts common MAC formats (colon-separated, dash-separated, plain hex).
/// Returns `None` if the OUI prefix is not in the database.
pub fn lookup(mac: &str) -> Option<&'static str> {
    let db = OUI_DB.get_or_init(init_db);
    let prefix = extract_oui_bytes(mac)?;
    db.get(&prefix).map(|s| s.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_prefix() {
        assert_eq!(parse_hex_prefix("286FB9"), Some([0x28, 0x6F, 0xB9]));
        assert_eq!(parse_hex_prefix("286fb9"), Some([0x28, 0x6F, 0xB9]));
        assert_eq!(parse_hex_prefix("ABCDE"), None); // too short
    }

    #[test]
    fn test_extract_oui_bytes() {
        // Colon-separated
        assert_eq!(
            extract_oui_bytes("28:6f:b9:12:34:56"),
            Some([0x28, 0x6F, 0xB9])
        );
        // Dash-separated
        assert_eq!(
            extract_oui_bytes("28-6F-B9-12-34-56"),
            Some([0x28, 0x6F, 0xB9])
        );
        // Plain hex
        assert_eq!(extract_oui_bytes("286fb9123456"), Some([0x28, 0x6F, 0xB9]));
        // Too short
        assert_eq!(extract_oui_bytes("28:6f"), None);
    }

    #[test]
    fn test_lookup_known_vendor() {
        // 286FB9 = Nokia Shanghai Bell Co., Ltd. (first entry in database)
        let result = lookup("28:6f:b9:12:34:56");
        assert!(result.is_some(), "Expected to find vendor for 28:6F:B9");
        assert!(
            result.unwrap().contains("Nokia"),
            "Expected Nokia in vendor name, got: {}",
            result.unwrap()
        );
    }

    #[test]
    fn test_lookup_case_insensitive() {
        let upper = lookup("28:6F:B9:AB:CD:EF");
        let lower = lookup("28:6f:b9:ab:cd:ef");
        assert_eq!(upper, lower, "OUI lookup should be case-insensitive");
    }

    #[test]
    fn test_lookup_unknown_vendor() {
        assert_eq!(lookup("FF:FF:FF:FF:FF:FF"), None);
        assert_eq!(lookup("ff:ff:ff:ff:ff:ff"), None);
    }

    #[test]
    fn test_lookup_short_mac_returns_none() {
        assert_eq!(lookup("00:50"), None);
    }

    #[test]
    fn test_db_has_entries() {
        let db = OUI_DB.get_or_init(init_db);
        assert!(
            db.len() > 30_000,
            "Expected >30k OUI entries, got {}",
            db.len()
        );
    }
}
