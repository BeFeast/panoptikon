//! NetFlow v5 UDP collector.
//!
//! Listens on a configurable UDP port (default 9995), parses NetFlow v5 packets
//! from pfSense/VyOS/softflowd, aggregates per-device bytes over 60-second
//! windows, and batch-inserts into `traffic_samples` with `source = 'netflow'`.

use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::net::UdpSocket;
use tracing::{debug, error, info, warn};

// ---------------------------------------------------------------------------
// NetFlow v5 wire format
// ---------------------------------------------------------------------------

/// NetFlow v5 header — 24 bytes.
#[derive(Debug, Clone)]
pub struct NetflowV5Header {
    pub version: u16,
    pub count: u16,
    pub sys_uptime: u32,
    pub unix_secs: u32,
    pub unix_nsecs: u32,
    pub flow_sequence: u32,
    pub engine_type: u8,
    pub engine_id: u8,
    pub sampling_interval: u16,
}

/// NetFlow v5 flow record — 48 bytes each.
#[derive(Debug, Clone)]
pub struct NetflowV5Record {
    pub src_addr: Ipv4Addr,
    pub dst_addr: Ipv4Addr,
    pub next_hop: Ipv4Addr,
    pub input: u16,
    pub output: u16,
    pub packets: u32,
    pub octets: u32,
    pub first: u32,
    pub last: u32,
    pub src_port: u16,
    pub dst_port: u16,
    pub _pad1: u8,
    pub tcp_flags: u8,
    pub protocol: u8,
    pub tos: u8,
    pub src_as: u16,
    pub dst_as: u16,
    pub src_mask: u8,
    pub dst_mask: u8,
    pub _pad2: u16,
}

pub const V5_HEADER_LEN: usize = 24;
pub const V5_RECORD_LEN: usize = 48;

/// Parse a NetFlow v5 header from exactly 24 bytes.
pub fn parse_v5_header(buf: &[u8]) -> Option<NetflowV5Header> {
    if buf.len() < V5_HEADER_LEN {
        return None;
    }
    let version = u16::from_be_bytes([buf[0], buf[1]]);
    if version != 5 {
        return None;
    }
    Some(NetflowV5Header {
        version,
        count: u16::from_be_bytes([buf[2], buf[3]]),
        sys_uptime: u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]),
        unix_secs: u32::from_be_bytes([buf[8], buf[9], buf[10], buf[11]]),
        unix_nsecs: u32::from_be_bytes([buf[12], buf[13], buf[14], buf[15]]),
        flow_sequence: u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]),
        engine_type: buf[20],
        engine_id: buf[21],
        sampling_interval: u16::from_be_bytes([buf[22], buf[23]]),
    })
}

/// Parse a single NetFlow v5 record from exactly 48 bytes.
pub fn parse_v5_record(buf: &[u8]) -> Option<NetflowV5Record> {
    if buf.len() < V5_RECORD_LEN {
        return None;
    }
    Some(NetflowV5Record {
        src_addr: Ipv4Addr::new(buf[0], buf[1], buf[2], buf[3]),
        dst_addr: Ipv4Addr::new(buf[4], buf[5], buf[6], buf[7]),
        next_hop: Ipv4Addr::new(buf[8], buf[9], buf[10], buf[11]),
        input: u16::from_be_bytes([buf[12], buf[13]]),
        output: u16::from_be_bytes([buf[14], buf[15]]),
        packets: u32::from_be_bytes([buf[16], buf[17], buf[18], buf[19]]),
        octets: u32::from_be_bytes([buf[20], buf[21], buf[22], buf[23]]),
        first: u32::from_be_bytes([buf[24], buf[25], buf[26], buf[27]]),
        last: u32::from_be_bytes([buf[28], buf[29], buf[30], buf[31]]),
        src_port: u16::from_be_bytes([buf[32], buf[33]]),
        dst_port: u16::from_be_bytes([buf[34], buf[35]]),
        _pad1: buf[36],
        tcp_flags: buf[37],
        protocol: buf[38],
        tos: buf[39],
        src_as: u16::from_be_bytes([buf[40], buf[41]]),
        dst_as: u16::from_be_bytes([buf[42], buf[43]]),
        src_mask: buf[44],
        dst_mask: buf[45],
        _pad2: u16::from_be_bytes([buf[46], buf[47]]),
    })
}

/// Parse a complete NetFlow v5 packet (header + N records).
pub fn parse_v5_packet(buf: &[u8]) -> Option<(NetflowV5Header, Vec<NetflowV5Record>)> {
    let header = parse_v5_header(buf)?;
    let count = header.count as usize;
    let expected_len = V5_HEADER_LEN + count * V5_RECORD_LEN;
    if buf.len() < expected_len {
        return None;
    }
    let mut records = Vec::with_capacity(count);
    for i in 0..count {
        let offset = V5_HEADER_LEN + i * V5_RECORD_LEN;
        if let Some(rec) = parse_v5_record(&buf[offset..offset + V5_RECORD_LEN]) {
            records.push(rec);
        }
    }
    Some((header, records))
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/// Per-device aggregated bytes within a time window.
#[derive(Debug, Default, Clone)]
pub struct DeviceTraffic {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

/// Accumulator for per-device traffic from NetFlow records.
/// `rx_bytes` = bytes destined *to* the device (dst_addr matched).
/// `tx_bytes` = bytes sent *from* the device (src_addr matched).
pub fn aggregate_flows(
    existing: &mut HashMap<String, DeviceTraffic>,
    device_id: &str,
    tx_bytes: u64,
    rx_bytes: u64,
) {
    let entry = existing.entry(device_id.to_string()).or_default();
    entry.tx_bytes += tx_bytes;
    entry.rx_bytes += rx_bytes;
}

// ---------------------------------------------------------------------------
// IP → device_id lookup
// ---------------------------------------------------------------------------

/// Look up a device_id by IP address from the device_ips table.
async fn lookup_device_by_ip(pool: &SqlitePool, ip: &str) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as(
        r#"SELECT device_id FROM device_ips WHERE ip = ? AND is_current = 1 LIMIT 1"#,
    )
    .bind(ip)
    .fetch_optional(pool)
    .await
    .ok()?;
    row.map(|(id,)| id)
}

// ---------------------------------------------------------------------------
// Batch insert into traffic_samples
// ---------------------------------------------------------------------------

/// Insert aggregated traffic into traffic_samples.
/// Converts total bytes in the window to bits-per-second (bps) assuming
/// a 60-second aggregation window.
async fn flush_traffic(pool: &SqlitePool, aggregated: HashMap<String, DeviceTraffic>) {
    if aggregated.is_empty() {
        return;
    }
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    for (device_id, traffic) in &aggregated {
        // Convert bytes over 60s → bits per second: bytes * 8 / 60
        let rx_bps = (traffic.rx_bytes * 8 / 60) as i64;
        let tx_bps = (traffic.tx_bytes * 8 / 60) as i64;

        if rx_bps == 0 && tx_bps == 0 {
            continue;
        }

        if let Err(e) = sqlx::query(
            r#"INSERT INTO traffic_samples (device_id, sampled_at, rx_bps, tx_bps, source)
               VALUES (?, ?, ?, ?, 'netflow')"#,
        )
        .bind(device_id)
        .bind(&now)
        .bind(rx_bps)
        .bind(tx_bps)
        .execute(pool)
        .await
        {
            error!(device_id, "Failed to insert netflow traffic sample: {e}");
        }
    }
    info!(
        devices = aggregated.len(),
        "Flushed netflow traffic samples"
    );
}

// ---------------------------------------------------------------------------
// Shared counter for flows received (exposed via API)
// ---------------------------------------------------------------------------

/// Global counter of total NetFlow records received.
pub static FLOWS_RECEIVED: AtomicU64 = AtomicU64::new(0);

/// Read the global counter value.
pub fn flows_received() -> u64 {
    FLOWS_RECEIVED.load(Ordering::Relaxed)
}

// ---------------------------------------------------------------------------
// Main collector task
// ---------------------------------------------------------------------------

/// Start the NetFlow v5 UDP collector.
///
/// Spawns a background tokio task that:
/// 1. Binds to `0.0.0.0:<port>` UDP.
/// 2. Receives datagrams, parses NetFlow v5 packets.
/// 3. Maps src/dst IP → device_id via device_ips table.
/// 4. Aggregates bytes per device over 60-second windows.
/// 5. Flushes aggregated data to traffic_samples.
pub fn start_collector(pool: SqlitePool, port: u16) {
    tokio::spawn(async move {
        let bind_addr: SocketAddr = ([0, 0, 0, 0], port).into();
        let socket = match UdpSocket::bind(bind_addr).await {
            Ok(s) => {
                info!(port, "NetFlow v5 collector listening on UDP port");
                Arc::new(s)
            }
            Err(e) => {
                error!(port, "Failed to bind NetFlow UDP socket: {e}");
                return;
            }
        };

        let mut buf = [0u8; 65535];
        let mut aggregated: HashMap<String, DeviceTraffic> = HashMap::new();
        let mut last_flush = tokio::time::Instant::now();
        let flush_interval = std::time::Duration::from_secs(60);

        loop {
            // Use a timeout so we can flush even when no packets arrive.
            let recv_result = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                socket.recv_from(&mut buf),
            )
            .await;

            match recv_result {
                Ok(Ok((len, _peer))) => {
                    if let Some((header, records)) = parse_v5_packet(&buf[..len]) {
                        debug!(
                            count = header.count,
                            seq = header.flow_sequence,
                            "Received NetFlow v5 packet"
                        );

                        FLOWS_RECEIVED.fetch_add(records.len() as u64, Ordering::Relaxed);

                        for rec in &records {
                            let src_ip = rec.src_addr.to_string();
                            let dst_ip = rec.dst_addr.to_string();
                            let octets = rec.octets as u64;

                            // Source device: this device sent traffic (tx).
                            if let Some(device_id) = lookup_device_by_ip(&pool, &src_ip).await {
                                aggregate_flows(&mut aggregated, &device_id, octets, 0);
                            }

                            // Destination device: this device received traffic (rx).
                            if let Some(device_id) = lookup_device_by_ip(&pool, &dst_ip).await {
                                aggregate_flows(&mut aggregated, &device_id, 0, octets);
                            }
                        }
                    } else {
                        debug!(len, "Received non-NetFlow-v5 packet, ignoring");
                    }
                }
                Ok(Err(e)) => {
                    warn!("NetFlow UDP recv error: {e}");
                }
                Err(_) => {
                    // Timeout — that's fine, just check if we should flush.
                }
            }

            // Flush every 60 seconds.
            if last_flush.elapsed() >= flush_interval {
                let to_flush = std::mem::take(&mut aggregated);
                flush_traffic(&pool, to_flush).await;
                last_flush = tokio::time::Instant::now();
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a valid NetFlow v5 packet with one record for testing.
    fn build_test_v5_packet(src: Ipv4Addr, dst: Ipv4Addr, octets: u32, packets: u32) -> Vec<u8> {
        let mut buf = Vec::with_capacity(V5_HEADER_LEN + V5_RECORD_LEN);

        // Header (24 bytes)
        buf.extend_from_slice(&5u16.to_be_bytes()); // version = 5
        buf.extend_from_slice(&1u16.to_be_bytes()); // count = 1
        buf.extend_from_slice(&1000u32.to_be_bytes()); // sys_uptime
        buf.extend_from_slice(&1700000000u32.to_be_bytes()); // unix_secs
        buf.extend_from_slice(&0u32.to_be_bytes()); // unix_nsecs
        buf.extend_from_slice(&42u32.to_be_bytes()); // flow_sequence
        buf.push(0); // engine_type
        buf.push(0); // engine_id
        buf.extend_from_slice(&0u16.to_be_bytes()); // sampling_interval

        // Record (48 bytes)
        buf.extend_from_slice(&src.octets()); // src_addr
        buf.extend_from_slice(&dst.octets()); // dst_addr
        buf.extend_from_slice(&Ipv4Addr::UNSPECIFIED.octets()); // next_hop
        buf.extend_from_slice(&0u16.to_be_bytes()); // input
        buf.extend_from_slice(&0u16.to_be_bytes()); // output
        buf.extend_from_slice(&packets.to_be_bytes()); // packets
        buf.extend_from_slice(&octets.to_be_bytes()); // octets
        buf.extend_from_slice(&100u32.to_be_bytes()); // first
        buf.extend_from_slice(&200u32.to_be_bytes()); // last
        buf.extend_from_slice(&12345u16.to_be_bytes()); // src_port
        buf.extend_from_slice(&80u16.to_be_bytes()); // dst_port
        buf.push(0); // pad1
        buf.push(0x02); // tcp_flags (SYN)
        buf.push(6); // protocol (TCP)
        buf.push(0); // tos
        buf.extend_from_slice(&0u16.to_be_bytes()); // src_as
        buf.extend_from_slice(&0u16.to_be_bytes()); // dst_as
        buf.push(24); // src_mask
        buf.push(24); // dst_mask
        buf.extend_from_slice(&0u16.to_be_bytes()); // pad2

        buf
    }

    #[test]
    fn test_parse_netflow_v5_header() {
        let pkt = build_test_v5_packet(
            Ipv4Addr::new(10, 10, 0, 100),
            Ipv4Addr::new(8, 8, 8, 8),
            1500,
            10,
        );

        let header = parse_v5_header(&pkt).expect("header should parse");
        assert_eq!(header.version, 5);
        assert_eq!(header.count, 1);
        assert_eq!(header.sys_uptime, 1000);
        assert_eq!(header.unix_secs, 1700000000);
        assert_eq!(header.flow_sequence, 42);
    }

    #[test]
    fn test_parse_netflow_v5_header_wrong_version() {
        let mut pkt = build_test_v5_packet(
            Ipv4Addr::new(10, 10, 0, 100),
            Ipv4Addr::new(8, 8, 8, 8),
            1500,
            10,
        );
        // Set version to 9
        pkt[0] = 0;
        pkt[1] = 9;
        assert!(
            parse_v5_header(&pkt).is_none(),
            "version 9 should be rejected"
        );
    }

    #[test]
    fn test_parse_netflow_v5_header_too_short() {
        let buf = vec![0u8; 10]; // way too short
        assert!(parse_v5_header(&buf).is_none());
    }

    #[test]
    fn test_parse_netflow_v5_record() {
        let pkt = build_test_v5_packet(
            Ipv4Addr::new(10, 10, 0, 100),
            Ipv4Addr::new(8, 8, 8, 8),
            1500,
            10,
        );

        let record = parse_v5_record(&pkt[V5_HEADER_LEN..]).expect("record should parse");
        assert_eq!(record.src_addr, Ipv4Addr::new(10, 10, 0, 100));
        assert_eq!(record.dst_addr, Ipv4Addr::new(8, 8, 8, 8));
        assert_eq!(record.octets, 1500);
        assert_eq!(record.packets, 10);
        assert_eq!(record.src_port, 12345);
        assert_eq!(record.dst_port, 80);
        assert_eq!(record.protocol, 6); // TCP
    }

    #[test]
    fn test_parse_netflow_v5_record_too_short() {
        let buf = vec![0u8; 20]; // 48 required
        assert!(parse_v5_record(&buf).is_none());
    }

    #[test]
    fn test_parse_v5_packet_full() {
        let pkt = build_test_v5_packet(
            Ipv4Addr::new(192, 168, 1, 10),
            Ipv4Addr::new(1, 1, 1, 1),
            65000,
            50,
        );

        let (header, records) = parse_v5_packet(&pkt).expect("full packet should parse");
        assert_eq!(header.version, 5);
        assert_eq!(header.count, 1);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].octets, 65000);
        assert_eq!(records[0].src_addr, Ipv4Addr::new(192, 168, 1, 10));
    }

    #[test]
    fn test_parse_v5_packet_truncated() {
        let pkt = build_test_v5_packet(
            Ipv4Addr::new(10, 10, 0, 1),
            Ipv4Addr::new(10, 10, 0, 2),
            100,
            1,
        );
        // Truncate — header says 1 record but we remove last 10 bytes.
        let truncated = &pkt[..pkt.len() - 10];
        assert!(
            parse_v5_packet(truncated).is_none(),
            "truncated packet should fail"
        );
    }

    #[test]
    fn test_aggregate_flows() {
        let mut map: HashMap<String, DeviceTraffic> = HashMap::new();

        // First flow: device sent 1000 bytes
        aggregate_flows(&mut map, "device-1", 1000, 0);
        assert_eq!(map["device-1"].tx_bytes, 1000);
        assert_eq!(map["device-1"].rx_bytes, 0);

        // Second flow: device received 2000 bytes
        aggregate_flows(&mut map, "device-1", 0, 2000);
        assert_eq!(map["device-1"].tx_bytes, 1000);
        assert_eq!(map["device-1"].rx_bytes, 2000);

        // Third flow: another tx
        aggregate_flows(&mut map, "device-1", 500, 300);
        assert_eq!(map["device-1"].tx_bytes, 1500);
        assert_eq!(map["device-1"].rx_bytes, 2300);
    }

    #[test]
    fn test_aggregate_flows_multiple_devices() {
        let mut map: HashMap<String, DeviceTraffic> = HashMap::new();

        aggregate_flows(&mut map, "dev-a", 1000, 2000);
        aggregate_flows(&mut map, "dev-b", 3000, 4000);
        aggregate_flows(&mut map, "dev-a", 500, 500);

        assert_eq!(map.len(), 2);
        assert_eq!(map["dev-a"].tx_bytes, 1500);
        assert_eq!(map["dev-a"].rx_bytes, 2500);
        assert_eq!(map["dev-b"].tx_bytes, 3000);
        assert_eq!(map["dev-b"].rx_bytes, 4000);
    }

    #[tokio::test]
    async fn test_netflow_insert_traffic_sample() {
        // In-memory SQLite DB with full schema.
        let pool = crate::db::init(":memory:").await.expect("DB init failed");

        // Insert a test device.
        let device_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, icon, is_known, is_favorite, first_seen_at, last_seen_at, is_online)
               VALUES (?, '00:11:22:33:44:55', 'netflow-test', 'desktop', 0, 0, datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&device_id)
        .execute(&pool)
        .await
        .unwrap();

        // Build aggregated data and flush.
        let mut aggregated = HashMap::new();
        aggregated.insert(
            device_id.clone(),
            DeviceTraffic {
                rx_bytes: 120_000,
                tx_bytes: 60_000,
            },
        );

        flush_traffic(&pool, aggregated).await;

        // Verify the traffic sample was inserted.
        let row: Option<(i64, i64, String)> = sqlx::query_as(
            r#"SELECT rx_bps, tx_bps, source FROM traffic_samples WHERE device_id = ?"#,
        )
        .bind(&device_id)
        .fetch_optional(&pool)
        .await
        .unwrap();

        let (rx_bps, tx_bps, source) = row.expect("traffic sample should exist");
        // 120_000 bytes * 8 / 60 = 16_000 bps
        assert_eq!(rx_bps, 16_000);
        // 60_000 bytes * 8 / 60 = 8_000 bps
        assert_eq!(tx_bps, 8_000);
        assert_eq!(source, "netflow");
    }

    #[tokio::test]
    async fn test_lookup_device_by_ip() {
        let pool = crate::db::init(":memory:").await.expect("DB init failed");

        let device_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO devices (id, mac, name, icon, is_known, is_favorite, first_seen_at, last_seen_at, is_online)
               VALUES (?, 'AA:BB:CC:DD:EE:FF', 'lookup-test', 'desktop', 0, 0, datetime('now'), datetime('now'), 1)"#,
        )
        .bind(&device_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"INSERT INTO device_ips (device_id, ip, seen_at, is_current) VALUES (?, '10.10.0.42', datetime('now'), 1)"#,
        )
        .bind(&device_id)
        .execute(&pool)
        .await
        .unwrap();

        // Should find the device.
        let found = lookup_device_by_ip(&pool, "10.10.0.42").await;
        assert_eq!(found, Some(device_id));

        // Unknown IP should return None.
        let not_found = lookup_device_by_ip(&pool, "10.10.0.99").await;
        assert!(not_found.is_none());
    }
}
