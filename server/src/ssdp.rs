//! UPnP/SSDP device discovery — M-SEARCH multicast to discover device type + manufacturer.
//!
//! Sends SSDP M-SEARCH multicast queries and parses responses to extract
//! device type, manufacturer, and model from UPnP device descriptions.

use sqlx::SqlitePool;
use std::net::{Ipv4Addr, SocketAddrV4, UdpSocket};
use std::time::Duration;
use tracing::{debug, info, warn};

const SSDP_MULTICAST: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;

/// SSDP M-SEARCH request payload.
const M_SEARCH: &str = "M-SEARCH * HTTP/1.1\r\n\
    HOST: 239.255.255.250:1900\r\n\
    MAN: \"ssdp:discover\"\r\n\
    MX: 3\r\n\
    ST: ssdp:all\r\n\
    \r\n";

/// Discovered UPnP device info from SSDP.
#[derive(Debug, Clone)]
pub struct SsdpDevice {
    pub ip: String,
    pub server: Option<String>,
    pub location: Option<String>,
    pub usn: Option<String>,
    pub st: Option<String>,
}

/// Run a single SSDP discovery sweep.
///
/// Sends M-SEARCH multicast and collects responses for `timeout` seconds.
pub fn ssdp_discover(timeout_secs: u64) -> Vec<SsdpDevice> {
    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(e) => {
            warn!("SSDP: failed to bind UDP socket: {e}");
            return Vec::new();
        }
    };

    if let Err(e) = socket.set_read_timeout(Some(Duration::from_secs(timeout_secs))) {
        warn!("SSDP: failed to set read timeout: {e}");
        return Vec::new();
    }

    let dest = SocketAddrV4::new(SSDP_MULTICAST, SSDP_PORT);
    if let Err(e) = socket.send_to(M_SEARCH.as_bytes(), dest) {
        warn!("SSDP: failed to send M-SEARCH: {e}");
        return Vec::new();
    }

    let mut devices = Vec::new();
    let mut buf = [0u8; 4096];

    loop {
        match socket.recv_from(&mut buf) {
            Ok((len, addr)) => {
                let response = String::from_utf8_lossy(&buf[..len]);
                let device = parse_ssdp_response(&response, &addr.ip().to_string());
                if let Some(dev) = device {
                    devices.push(dev);
                }
            }
            Err(ref e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                break; // Timeout reached
            }
            Err(e) => {
                debug!("SSDP: recv error: {e}");
                break;
            }
        }
    }

    // Deduplicate by IP + ST.
    devices.sort_by(|a, b| (&a.ip, &a.st).cmp(&(&b.ip, &b.st)));
    devices.dedup_by(|a, b| a.ip == b.ip && a.st == b.st);

    devices
}

/// Parse an SSDP response into an SsdpDevice.
fn parse_ssdp_response(response: &str, ip: &str) -> Option<SsdpDevice> {
    if !response.contains("HTTP/1.1 200") && !response.to_uppercase().contains("NOTIFY") {
        return None;
    }

    let mut server = None;
    let mut location = None;
    let mut usn = None;
    let mut st = None;

    for line in response.lines() {
        let lower = line.to_lowercase();
        if lower.starts_with("server:") {
            server = Some(line[7..].trim().to_string());
        } else if lower.starts_with("location:") {
            location = Some(line[9..].trim().to_string());
        } else if lower.starts_with("usn:") {
            usn = Some(line[4..].trim().to_string());
        } else if lower.starts_with("st:") {
            st = Some(line[3..].trim().to_string());
        }
    }

    Some(SsdpDevice {
        ip: ip.to_string(),
        server,
        location,
        usn,
        st,
    })
}

/// Infer device type from SSDP service type (ST) header.
fn infer_device_type_from_st(st: &str) -> Option<&'static str> {
    let lower = st.to_lowercase();
    if lower.contains("mediarenderer") {
        Some("tv")
    } else if lower.contains("mediaserver") {
        Some("server")
    } else if lower.contains("printer") {
        Some("printer")
    } else if lower.contains("internetgatewaydevice") || lower.contains("wandevice") {
        Some("router")
    } else {
        None
    }
}

/// Infer device brand from SSDP Server header.
fn infer_brand_from_server(server: &str) -> Option<&'static str> {
    let lower = server.to_lowercase();
    if lower.contains("roku") {
        Some("Roku")
    } else if lower.contains("samsung") {
        Some("Samsung")
    } else if lower.contains("sony") {
        Some("Sony")
    } else if lower.contains("lg") {
        Some("LG")
    } else if lower.contains("philips") {
        Some("Philips")
    } else if lower.contains("google") {
        Some("Google")
    } else if lower.contains("amazon") {
        Some("Amazon")
    } else if lower.contains("microsoft") {
        Some("Microsoft")
    } else if lower.contains("synology") {
        Some("Synology")
    } else if lower.contains("apple") {
        Some("Apple")
    } else if lower.contains("sonos") {
        Some("Sonos")
    } else {
        None
    }
}

/// Enrich devices in the database with SSDP discovery results.
pub async fn enrich_from_ssdp(pool: &SqlitePool) {
    info!("Running UPnP/SSDP discovery scan");

    // Run SSDP discovery in a blocking thread (uses sync UDP).
    let devices = tokio::task::spawn_blocking(|| ssdp_discover(4)).await;
    let devices = match devices {
        Ok(d) => d,
        Err(e) => {
            warn!("SSDP discovery task failed: {e}");
            return;
        }
    };

    if devices.is_empty() {
        debug!("SSDP: no devices discovered");
        return;
    }

    info!(count = devices.len(), "SSDP discovery found devices");

    let mut updated = 0u32;
    for dev in &devices {
        // Find device by IP.
        let device_row: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
            r#"SELECT d.id, d.device_type, d.device_brand
               FROM devices d
               JOIN device_ips di ON di.device_id = d.id
               WHERE di.ip = ? AND di.is_current = 1
               LIMIT 1"#,
        )
        .bind(&dev.ip)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        let (device_id, current_type, current_brand) = match device_row {
            Some(r) => r,
            None => continue, // Device not in our DB
        };

        let mut new_type: Option<&str> = None;
        let mut new_brand: Option<&str> = None;

        // Infer type from ST header.
        if current_type.is_none() {
            if let Some(ref st) = dev.st {
                new_type = infer_device_type_from_st(st);
            }
        }

        // Infer brand from Server header.
        if current_brand.is_none() {
            if let Some(ref server) = dev.server {
                new_brand = infer_brand_from_server(server);
            }
        }

        if new_type.is_some() || new_brand.is_some() {
            let result = sqlx::query(
                r#"UPDATE devices SET
                    device_type = COALESCE(?, device_type),
                    device_brand = COALESCE(?, device_brand),
                    enrichment_source = COALESCE(
                        CASE WHEN ? IS NOT NULL OR ? IS NOT NULL THEN 'ssdp' ELSE NULL END,
                        enrichment_source
                    ),
                    updated_at = datetime('now')
                WHERE id = ? AND enrichment_corrected != 1"#,
            )
            .bind(new_type)
            .bind(new_brand)
            .bind(new_type)
            .bind(new_brand)
            .bind(&device_id)
            .execute(pool)
            .await;

            match result {
                Ok(r) if r.rows_affected() > 0 => {
                    info!(
                        device_id = %device_id,
                        ip = %dev.ip,
                        device_type = ?new_type,
                        brand = ?new_brand,
                        "SSDP enriched device"
                    );
                    updated += 1;
                }
                Ok(_) => {}
                Err(e) => {
                    warn!(device_id = %device_id, error = %e, "Failed to apply SSDP enrichment");
                }
            }
        }
    }

    if updated > 0 {
        info!(updated, "SSDP enrichment complete");
    }
}

/// Start the periodic SSDP discovery background task.
///
/// Runs every 10 minutes.
pub fn start_ssdp_discovery_task(pool: SqlitePool) {
    info!("Starting UPnP/SSDP discovery (every 10 min)");
    tokio::spawn(async move {
        // Initial delay.
        tokio::time::sleep(Duration::from_secs(15)).await;

        let mut interval = tokio::time::interval(Duration::from_secs(600));
        loop {
            interval.tick().await;
            enrich_from_ssdp(&pool).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ssdp_response() {
        let response = "HTTP/1.1 200 OK\r\n\
            CACHE-CONTROL: max-age=1800\r\n\
            LOCATION: http://10.0.0.1:49152/rootDesc.xml\r\n\
            SERVER: Linux/4.14 UPnP/1.0 Roku/9.4\r\n\
            ST: upnp:rootdevice\r\n\
            USN: uuid:123::upnp:rootdevice\r\n\
            \r\n";

        let dev = parse_ssdp_response(response, "10.0.0.1").unwrap();
        assert_eq!(dev.ip, "10.0.0.1");
        assert_eq!(
            dev.server.as_deref(),
            Some("Linux/4.14 UPnP/1.0 Roku/9.4")
        );
        assert_eq!(
            dev.location.as_deref(),
            Some("http://10.0.0.1:49152/rootDesc.xml")
        );
        assert_eq!(dev.st.as_deref(), Some("upnp:rootdevice"));
    }

    #[test]
    fn test_infer_device_type_from_st() {
        assert_eq!(
            infer_device_type_from_st("urn:schemas-upnp-org:device:MediaRenderer:1"),
            Some("tv")
        );
        assert_eq!(
            infer_device_type_from_st("urn:schemas-upnp-org:device:InternetGatewayDevice:1"),
            Some("router")
        );
        assert_eq!(
            infer_device_type_from_st("urn:schemas-upnp-org:device:Printer:1"),
            Some("printer")
        );
        assert_eq!(infer_device_type_from_st("upnp:rootdevice"), None);
    }

    #[test]
    fn test_infer_brand_from_server() {
        assert_eq!(
            infer_brand_from_server("Linux/4.14 UPnP/1.0 Roku/9.4"),
            Some("Roku")
        );
        assert_eq!(
            infer_brand_from_server("Samsung Smart TV"),
            Some("Samsung")
        );
        assert_eq!(infer_brand_from_server("Generic UPnP/1.0"), None);
    }
}
