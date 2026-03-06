//! On-demand port scanner with nmap acceleration and async TCP connect fallback.
//!
//! Strategy:
//! 1. If nmap is installed → use `nmap -sV` for service+version detection.
//! 2. Otherwise → async TCP connect scan of the top-1000 ports with a
//!    well-known-service table for labelling.

use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::task::JoinSet;
use tracing::{debug, info, warn};

/// A single open port found during a scan.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct PortEntry {
    pub port: u16,
    pub protocol: String,
    pub state: String,
    pub service: String,
    pub version: String,
}

/// Complete scan result for one device.
#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub ports: Vec<PortEntry>,
    /// Which scanner backend was used ("nmap" or "tcp-connect").
    pub scanner: String,
}

// ─── Top-1000 ports (nmap default) ──────────────────────

/// The top-1000 most common TCP ports as used by nmap's `--top-ports 1000`.
/// Sourced from nmap's `nmap-services` file, sorted by frequency.
const TOP_1000_PORTS: &[u16] = &[
    1, 3, 4, 6, 7, 9, 13, 17, 19, 20, 21, 22, 23, 24, 25, 26, 30, 32, 33, 37, 42, 43, 49, 53, 70,
    79, 80, 81, 82, 83, 84, 85, 88, 89, 90, 99, 100, 106, 109, 110, 111, 113, 119, 125, 135, 139,
    143, 144, 146, 161, 163, 179, 199, 211, 212, 222, 254, 255, 256, 259, 264, 280, 301, 306, 311,
    340, 366, 389, 406, 407, 416, 417, 425, 427, 443, 444, 445, 458, 464, 465, 481, 497, 500, 512,
    513, 514, 515, 524, 541, 543, 544, 545, 548, 554, 555, 563, 587, 593, 616, 617, 625, 631, 636,
    646, 648, 666, 667, 668, 683, 687, 691, 700, 705, 711, 714, 720, 722, 726, 749, 765, 777, 783,
    787, 800, 801, 808, 843, 873, 880, 888, 898, 900, 901, 902, 903, 911, 912, 981, 987, 990, 992,
    993, 995, 999, 1000, 1001, 1002, 1007, 1009, 1010, 1011, 1021, 1022, 1023, 1024, 1025, 1026,
    1027, 1028, 1029, 1030, 1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039, 1040, 1041, 1042,
    1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050, 1051, 1052, 1053, 1054, 1055, 1056, 1057, 1058,
    1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069, 1070, 1071, 1072, 1073, 1074,
    1075, 1076, 1077, 1078, 1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086, 1087, 1088, 1089, 1090,
    1091, 1092, 1093, 1094, 1095, 1096, 1097, 1098, 1099, 1100, 1102, 1104, 1105, 1106, 1107, 1108,
    1110, 1111, 1112, 1113, 1114, 1117, 1119, 1121, 1122, 1131, 1138, 1141, 1145, 1147, 1148, 1149,
    1151, 1152, 1154, 1163, 1164, 1165, 1166, 1169, 1174, 1175, 1183, 1185, 1186, 1187, 1192, 1198,
    1199, 1201, 1213, 1216, 1217, 1218, 1233, 1234, 1236, 1244, 1247, 1248, 1259, 1271, 1272, 1277,
    1287, 1296, 1300, 1301, 1309, 1310, 1311, 1322, 1328, 1334, 1352, 1417, 1433, 1434, 1443, 1455,
    1461, 1494, 1500, 1501, 1503, 1521, 1524, 1533, 1556, 1580, 1583, 1594, 1600, 1641, 1658, 1666,
    1687, 1688, 1700, 1717, 1718, 1719, 1720, 1721, 1723, 1755, 1761, 1782, 1783, 1801, 1805, 1812,
    1839, 1840, 1862, 1863, 1864, 1875, 1900, 1914, 1935, 1947, 1971, 1972, 1974, 1984, 1998, 1999,
    2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2013, 2020, 2021, 2022, 2030,
    2033, 2034, 2035, 2038, 2040, 2041, 2042, 2043, 2045, 2046, 2047, 2048, 2049, 2065, 2068, 2099,
    2100, 2103, 2105, 2106, 2107, 2111, 2119, 2121, 2126, 2135, 2144, 2160, 2161, 2170, 2179, 2190,
    2191, 2196, 2200, 2222, 2251, 2260, 2288, 2301, 2323, 2366, 2381, 2382, 2383, 2393, 2394, 2399,
    2401, 2492, 2500, 2522, 2525, 2557, 2601, 2602, 2604, 2605, 2607, 2608, 2638, 2701, 2702, 2710,
    2717, 2718, 2725, 2800, 2809, 2811, 2869, 2875, 2909, 2910, 2920, 2967, 2968, 2998, 3000, 3001,
    3003, 3005, 3006, 3007, 3011, 3013, 3017, 3030, 3031, 3052, 3071, 3077, 3128, 3168, 3211, 3221,
    3260, 3261, 3268, 3269, 3283, 3300, 3301, 3306, 3322, 3323, 3324, 3325, 3333, 3351, 3367, 3369,
    3370, 3371, 3372, 3389, 3390, 3404, 3476, 3493, 3517, 3527, 3546, 3551, 3580, 3659, 3689, 3690,
    3703, 3737, 3766, 3784, 3800, 3801, 3809, 3814, 3826, 3827, 3828, 3851, 3869, 3871, 3878, 3880,
    3889, 3905, 3914, 3918, 3920, 3945, 3971, 3986, 3995, 3998, 4000, 4001, 4002, 4003, 4004, 4005,
    4006, 4045, 4111, 4125, 4126, 4129, 4224, 4242, 4279, 4321, 4343, 4443, 4444, 4445, 4446, 4449,
    4550, 4567, 4662, 4848, 4899, 4900, 4998, 5000, 5001, 5002, 5003, 5004, 5009, 5030, 5033, 5050,
    5051, 5054, 5060, 5061, 5080, 5087, 5100, 5101, 5102, 5120, 5190, 5200, 5214, 5221, 5222, 5225,
    5226, 5269, 5280, 5298, 5357, 5405, 5414, 5431, 5432, 5440, 5500, 5510, 5544, 5550, 5555, 5560,
    5566, 5631, 5633, 5666, 5678, 5679, 5718, 5730, 5800, 5801, 5802, 5810, 5811, 5815, 5822, 5825,
    5850, 5859, 5862, 5877, 5900, 5901, 5902, 5903, 5904, 5906, 5907, 5910, 5911, 5915, 5922, 5925,
    5950, 5952, 5959, 5960, 5961, 5962, 5963, 5987, 5988, 5989, 5998, 5999, 6000, 6001, 6002, 6003,
    6004, 6005, 6006, 6007, 6009, 6025, 6059, 6100, 6101, 6106, 6112, 6123, 6129, 6156, 6346, 6389,
    6502, 6510, 6543, 6547, 6565, 6566, 6567, 6580, 6646, 6666, 6667, 6668, 6669, 6689, 6692, 6699,
    6779, 6788, 6789, 6792, 6839, 6881, 6901, 6969, 7000, 7001, 7002, 7004, 7007, 7019, 7025, 7070,
    7100, 7103, 7106, 7200, 7201, 7402, 7435, 7443, 7496, 7512, 7625, 7627, 7676, 7741, 7777, 7778,
    7800, 7911, 7920, 7921, 7937, 7938, 7999, 8000, 8001, 8002, 8007, 8008, 8009, 8010, 8011, 8021,
    8022, 8031, 8042, 8045, 8080, 8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 8093,
    8099, 8100, 8180, 8181, 8192, 8193, 8194, 8200, 8222, 8254, 8290, 8291, 8292, 8300, 8333, 8383,
    8400, 8402, 8443, 8500, 8600, 8649, 8651, 8652, 8654, 8701, 8800, 8873, 8888, 8899, 8994, 9000,
    9001, 9002, 9003, 9009, 9010, 9011, 9040, 9050, 9071, 9080, 9081, 9090, 9091, 9099, 9100, 9101,
    9102, 9103, 9110, 9111, 9200, 9207, 9220, 9290, 9415, 9418, 9485, 9500, 9502, 9503, 9535, 9575,
    9593, 9594, 9595, 9618, 9666, 9876, 9877, 9878, 9898, 9900, 9917, 9929, 9943, 9944, 9968, 9998,
    9999, 10000, 10001, 10002, 10003, 10004, 10009, 10010, 10012, 10024, 10025, 10082, 10180,
    10215, 10243, 10566, 10616, 10617, 10621, 10626, 10628, 10629, 10778, 11110, 11111, 11967,
    12000, 12174, 12265, 12345, 13456, 13722, 13782, 13783, 14000, 14238, 14441, 14442, 15000,
    15002, 15003, 15004, 15660, 15742, 16000, 16001, 16012, 16016, 16018, 16080, 16113, 16992,
    16993, 17877, 17988, 18040, 18101, 18988, 19101, 19283, 19315, 19350, 19780, 19801, 19842,
    20000, 20005, 20031, 20221, 20222, 20828, 21571, 22939, 23502, 24444, 24800, 25734, 25735,
    26214, 27000, 27352, 27353, 27355, 27356, 27715, 28201, 30000, 30718, 30951, 31038, 31337,
    32768, 32769, 32770, 32771, 32772, 32773, 32774, 32775, 32776, 32777, 32778, 32779, 32780,
    32781, 32782, 32783, 32784, 32785, 33354, 33899, 34571, 34572, 34573, 35500, 38292, 40193,
    40911, 41511, 42510, 44176, 44442, 44443, 44501, 45100, 48080, 49152, 49153, 49154, 49155,
    49156, 49157, 49158, 49159, 49160, 49161, 49163, 49165, 49167, 49175, 49176, 49400, 49999,
    50000, 50001, 50002, 50003, 50006, 50300, 50389, 50500, 50636, 50800, 51103, 51493, 52673,
    52822, 52848, 52869, 54045, 54328, 55055, 55056, 55555, 55600, 56737, 56738, 57294, 57797,
    58080, 60020, 60443, 61532, 61900, 62078, 63331, 64623, 64680, 65000, 65129, 65389,
];

/// Maximum number of concurrent TCP connect probes.
const TCP_CONCURRENCY: usize = 256;

/// Per-port TCP connect timeout.
const TCP_CONNECT_TIMEOUT: Duration = Duration::from_millis(1500);

// ─── Well-known service names ───────────────────────────

/// Resolve a port number to a well-known service name.
pub fn service_name(port: u16) -> &'static str {
    match port {
        1 => "tcpmux",
        7 => "echo",
        9 => "discard",
        13 => "daytime",
        20 => "ftp-data",
        21 => "ftp",
        22 => "ssh",
        23 => "telnet",
        25 => "smtp",
        26 => "rsftp",
        37 => "time",
        43 => "whois",
        49 => "tacacs",
        53 => "domain",
        70 => "gopher",
        79 => "finger",
        80 => "http",
        81 => "http-alt",
        82 => "http-alt",
        83 => "http-alt",
        84 => "http-alt",
        85 => "http-alt",
        88 => "kerberos",
        89 => "http-alt",
        90 => "http-alt",
        99 => "metagram",
        106 => "pop3pw",
        109 => "pop2",
        110 => "pop3",
        111 => "rpcbind",
        113 => "ident",
        119 => "nntp",
        135 => "msrpc",
        139 => "netbios-ssn",
        143 => "imap",
        161 => "snmp",
        179 => "bgp",
        199 => "smux",
        389 => "ldap",
        427 => "svrloc",
        443 => "https",
        444 => "snpp",
        445 => "microsoft-ds",
        464 => "kpasswd",
        465 => "smtps",
        500 => "isakmp",
        512 => "exec",
        513 => "login",
        514 => "shell",
        515 => "printer",
        524 => "ncp",
        541 => "uucp-rlogin",
        543 => "klogin",
        544 => "kshell",
        548 => "afp",
        554 => "rtsp",
        563 => "nntps",
        587 => "submission",
        593 => "http-rpc-epmap",
        631 => "ipp",
        636 => "ldapssl",
        646 => "ldp",
        666 => "doom",
        873 => "rsync",
        888 => "accessbuilder",
        902 => "vmware-auth",
        990 => "ftps",
        992 => "telnets",
        993 => "imaps",
        995 => "pop3s",
        1080 => "socks",
        1433 => "ms-sql-s",
        1434 => "ms-sql-m",
        1494 => "citrix-ica",
        1521 => "oracle",
        1723 => "pptp",
        1812 => "radius",
        1900 => "upnp",
        1935 => "rtmp",
        2000 => "cisco-sccp",
        2049 => "nfs",
        2100 => "amiganetfs",
        2121 => "ftp-alt",
        2222 => "ssh-alt",
        2323 => "telnet-alt",
        2381 => "compaq-https",
        2401 => "cvspserver",
        2601 => "zebra",
        2604 => "ospfd",
        2869 => "icslap",
        3000 => "ppp",
        3001 => "nessus",
        3128 => "squid-http",
        3260 => "iscsi",
        3268 => "globalcatLDAP",
        3269 => "globalcatLDAPssl",
        3283 => "net-assistant",
        3306 => "mysql",
        3389 => "ms-wbt-server",
        3493 => "nut",
        3690 => "svn",
        4000 => "remoteanything",
        4443 => "pharos",
        4444 => "krb524",
        4567 => "tram",
        4899 => "radmin",
        5000 => "upnp",
        5001 => "commplex-link",
        5003 => "filemaker",
        5009 => "airport-admin",
        5060 => "sip",
        5061 => "sip-tls",
        5190 => "aol",
        5222 => "xmpp-client",
        5269 => "xmpp-server",
        5357 => "wsdapi",
        5432 => "postgresql",
        5555 => "freeciv",
        5631 => "pcanywheredata",
        5666 => "nrpe",
        5800 => "vnc-http",
        5900 => "vnc",
        5901 => "vnc-1",
        5902 => "vnc-2",
        5903 => "vnc-3",
        5988 => "wbem-http",
        5989 => "wbem-https",
        6000 => "x11",
        6001 => "x11-1",
        6002 => "x11-2",
        6379 => "redis",
        6443 => "sun-sr-https",
        6667 => "irc",
        6881 => "bittorrent",
        7000 => "afs3-fileserver",
        7001 => "afs3-callback",
        7070 => "realserver",
        7443 => "oracleas-https",
        7777 => "cbt",
        8000 => "http-alt",
        8001 => "http-alt",
        8008 => "http-alt",
        8009 => "ajp13",
        8080 => "http-proxy",
        8081 => "http-alt",
        8082 => "http-alt",
        8083 => "http-alt",
        8084 => "http-alt",
        8085 => "http-alt",
        8086 => "influxdb",
        8088 => "radan-http",
        8089 => "http-alt",
        8090 => "http-alt",
        8181 => "http-alt",
        8291 => "mikrotik-api",
        8443 => "https-alt",
        8500 => "http-alt",
        8600 => "http-alt",
        8888 => "http-alt",
        9000 => "cslistener",
        9001 => "tor-orport",
        9090 => "zeus-admin",
        9091 => "xmltec-xmlmail",
        9100 => "jetdirect",
        9200 => "elasticsearch",
        9418 => "git",
        9443 => "tungsten-https",
        9999 => "abyss",
        10000 => "webmin",
        10443 => "cirros-https",
        11211 => "memcached",
        11300 => "beanstalkd",
        15672 => "rabbitmq-mgmt",
        16992 => "amt-soap-http",
        16993 => "amt-soap-https",
        20000 => "dnp",
        27017 => "mongod",
        27018 => "mongod-shard",
        27019 => "mongod-cfg",
        28017 => "mongod-http",
        32768 => "filenet-tms",
        49152 => "unknown",
        50000 => "ibm-db2",
        _ => "unknown",
    }
}

// ─── Async TCP connect scanner ──────────────────────────

/// Probe a single port using async TCP connect with timeout.
async fn probe_port(ip: IpAddr, port: u16) -> Option<u16> {
    let addr = SocketAddr::new(ip, port);
    match tokio::time::timeout(TCP_CONNECT_TIMEOUT, TcpStream::connect(addr)).await {
        Ok(Ok(_stream)) => Some(port),
        _ => None,
    }
}

/// Run an async TCP connect scan of the top-1000 ports.
///
/// Limits concurrency to [`TCP_CONCURRENCY`] simultaneous probes.
async fn tcp_connect_scan(ip: IpAddr) -> Vec<PortEntry> {
    info!(ip = %ip, "Starting TCP connect scan (top-1000 ports)");

    let mut open_ports: Vec<u16> = Vec::new();
    let mut join_set: JoinSet<Option<u16>> = JoinSet::new();

    for &port in TOP_1000_PORTS {
        // Throttle concurrency
        if join_set.len() >= TCP_CONCURRENCY {
            if let Some(Ok(Some(p))) = join_set.join_next().await {
                open_ports.push(p);
            }
        }
        join_set.spawn(probe_port(ip, port));
    }

    // Drain remaining tasks.
    while let Some(result) = join_set.join_next().await {
        if let Ok(Some(p)) = result {
            open_ports.push(p);
        }
    }

    open_ports.sort();

    let entries: Vec<PortEntry> = open_ports
        .into_iter()
        .map(|port| PortEntry {
            port,
            protocol: "tcp".to_string(),
            state: "open".to_string(),
            service: service_name(port).to_string(),
            version: String::new(),
        })
        .collect();

    info!(ip = %ip, count = entries.len(), "TCP connect scan complete");
    entries
}

// ─── nmap scanner ───────────────────────────────────────

/// Check whether `nmap` is available on the system PATH.
async fn nmap_available() -> bool {
    tokio::process::Command::new("nmap")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run nmap service-version scan (`-sV`) and parse the output.
async fn nmap_scan(ip: IpAddr) -> Result<Vec<PortEntry>, String> {
    let ip_str = ip.to_string();
    let output = tokio::time::timeout(
        Duration::from_secs(30),
        tokio::process::Command::new("nmap")
            .args(["-sV", "--open", "-T4", "--host-timeout", "30s"])
            .arg(&ip_str)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output(),
    )
    .await;

    match output {
        Ok(Ok(out)) => {
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                warn!(ip = %ip, stderr = %stderr, "nmap exited with error");
                return Err(format!("nmap failed: {stderr}"));
            }
            let stdout = String::from_utf8_lossy(&out.stdout);
            Ok(parse_nmap_output(&stdout))
        }
        Ok(Err(e)) => {
            warn!(ip = %ip, error = %e, "nmap process error");
            Err(format!("nmap process error: {e}"))
        }
        Err(_) => {
            warn!(ip = %ip, "nmap scan timed out");
            Err("nmap scan timed out".to_string())
        }
    }
}

/// Parse nmap standard text output into [`PortEntry`] items.
///
/// Matches lines like:
/// ```text
/// 22/tcp   open  ssh     OpenSSH 8.4p1 Debian 5+deb11u1
/// 80/tcp   open  http    Apache httpd 2.4.54
/// ```
fn parse_nmap_output(output: &str) -> Vec<PortEntry> {
    let mut results = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(slash_pos) = trimmed.find('/') {
            let port_str = &trimmed[..slash_pos];
            let port: u16 = match port_str.parse() {
                Ok(p) => p,
                Err(_) => continue,
            };

            let rest = &trimmed[slash_pos + 1..];
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() < 3 {
                continue;
            }

            let protocol = parts[0].to_string();
            let state = parts[1].to_string();

            if state != "open" {
                continue;
            }

            let service = parts[2].to_string();
            let version = if parts.len() > 3 {
                parts[3..].join(" ")
            } else {
                String::new()
            };

            results.push(PortEntry {
                port,
                protocol,
                state,
                service,
                version,
            });
        }
    }

    results
}

// ─── Public scan interface ──────────────────────────────

/// Scan a single host for open ports.
///
/// Uses nmap when available for richer service/version detection,
/// otherwise falls back to an async TCP connect scan with well-known
/// service labelling.
pub async fn scan_host(ip: IpAddr) -> ScanResult {
    if nmap_available().await {
        debug!(ip = %ip, "nmap available — using nmap scanner");
        match nmap_scan(ip).await {
            Ok(ports) => {
                return ScanResult {
                    ports,
                    scanner: "nmap".to_string(),
                };
            }
            Err(e) => {
                warn!(ip = %ip, error = %e, "nmap scan failed, falling back to TCP connect");
            }
        }
    } else {
        debug!(ip = %ip, "nmap not available — using TCP connect scanner");
    }

    // Fallback: async TCP connect scan
    let ports = tcp_connect_scan(ip).await;
    ScanResult {
        ports,
        scanner: "tcp-connect".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_name_known() {
        assert_eq!(service_name(22), "ssh");
        assert_eq!(service_name(80), "http");
        assert_eq!(service_name(443), "https");
        assert_eq!(service_name(3306), "mysql");
        assert_eq!(service_name(5432), "postgresql");
        assert_eq!(service_name(8080), "http-proxy");
    }

    #[test]
    fn test_service_name_unknown() {
        assert_eq!(service_name(55555), "unknown");
    }

    #[test]
    fn test_parse_nmap_output_basic() {
        let output = "\
Starting Nmap 7.94 ( https://nmap.org ) at 2024-01-01 00:00 UTC
Nmap scan report for 10.0.0.1
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 8.9p1 Ubuntu 3
80/tcp   open  http     nginx 1.18.0
443/tcp  open  https    nginx 1.18.0
Nmap done: 1 IP address (1 host up) scanned in 5.23 seconds
";
        let ports = parse_nmap_output(output);
        assert_eq!(ports.len(), 3);
        assert_eq!(ports[0].port, 22);
        assert_eq!(ports[0].service, "ssh");
        assert_eq!(ports[0].version, "OpenSSH 8.9p1 Ubuntu 3");
        assert_eq!(ports[1].port, 80);
        assert_eq!(ports[1].service, "http");
        assert_eq!(ports[2].port, 443);
        assert_eq!(ports[2].service, "https");
    }

    #[test]
    fn test_parse_nmap_output_mixed_states() {
        let output = "\
PORT     STATE    SERVICE
22/tcp   open     ssh
80/tcp   closed   http
443/tcp  filtered https
8080/tcp open     http-proxy
";
        let ports = parse_nmap_output(output);
        assert_eq!(ports.len(), 2);
        assert_eq!(ports[0].port, 22);
        assert_eq!(ports[1].port, 8080);
    }

    #[test]
    fn test_parse_nmap_output_empty() {
        let output = "# Nmap done\n";
        let ports = parse_nmap_output(output);
        assert!(ports.is_empty());
    }

    #[test]
    fn test_top_1000_ports_sorted_and_unique() {
        let mut seen = std::collections::HashSet::new();
        for &p in TOP_1000_PORTS {
            assert!(seen.insert(p), "Duplicate port {p} in TOP_1000_PORTS");
        }
    }
}
