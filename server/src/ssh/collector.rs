//! SSH metric collector — connects to a remote host and runs commands to gather
//! CPU, memory, disk, uptime, hostname, and OS information.

use anyhow::{Context, Result};
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::time::Duration;

/// Parsed metrics from an SSH collection run.
#[derive(Debug, Default)]
pub struct SshMetrics {
    pub hostname: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
    pub cpu_percent: Option<f64>,
    pub mem_total: Option<i64>,
    pub mem_used: Option<i64>,
    pub disk_total: Option<i64>,
    pub disk_used: Option<i64>,
    pub uptime_seconds: Option<i64>,
}

/// Run a single command over an authenticated SSH session and return stdout.
fn exec_command(sess: &Session, cmd: &str) -> Result<String> {
    let mut channel = sess.channel_session().context("open channel")?;
    channel.exec(cmd).context("exec command")?;
    let mut output = String::new();
    channel.read_to_string(&mut output).context("read stdout")?;
    channel.wait_close().ok();
    Ok(output)
}

/// Collect metrics from a remote host via SSH using password authentication.
pub fn collect_password(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<SshMetrics> {
    let sess = connect_and_auth_password(host, port, username, password)?;
    collect_metrics(&sess)
}

/// Collect metrics from a remote host via SSH using private key authentication.
pub fn collect_key(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
) -> Result<SshMetrics> {
    let sess = connect_and_auth_key(host, port, username, private_key_pem)?;
    collect_metrics(&sess)
}

/// Test SSH connection — returns Ok(()) if authentication succeeds.
pub fn test_connection_password(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<()> {
    let _sess = connect_and_auth_password(host, port, username, password)?;
    Ok(())
}

/// Test SSH connection with key authentication.
pub fn test_connection_key(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
) -> Result<()> {
    let _sess = connect_and_auth_key(host, port, username, private_key_pem)?;
    Ok(())
}

fn connect_and_auth_password(
    host: &str,
    port: u16,
    username: &str,
    password: &str,
) -> Result<Session> {
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect_timeout(
        &addr
            .parse()
            .with_context(|| format!("invalid address: {addr}"))?,
        Duration::from_secs(10),
    )
    .with_context(|| format!("TCP connect to {addr}"))?;
    tcp.set_read_timeout(Some(Duration::from_secs(15)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(15)))?;

    let mut sess = Session::new().context("create SSH session")?;
    sess.set_tcp_stream(tcp);
    sess.handshake().context("SSH handshake")?;
    sess.userauth_password(username, password)
        .context("SSH password auth")?;
    if !sess.authenticated() {
        anyhow::bail!("SSH authentication failed");
    }
    Ok(sess)
}

fn connect_and_auth_key(
    host: &str,
    port: u16,
    username: &str,
    private_key_pem: &str,
) -> Result<Session> {
    let addr = format!("{}:{}", host, port);
    let tcp = TcpStream::connect_timeout(
        &addr
            .parse()
            .with_context(|| format!("invalid address: {addr}"))?,
        Duration::from_secs(10),
    )
    .with_context(|| format!("TCP connect to {addr}"))?;
    tcp.set_read_timeout(Some(Duration::from_secs(15)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(15)))?;

    let mut sess = Session::new().context("create SSH session")?;
    sess.set_tcp_stream(tcp);
    sess.handshake().context("SSH handshake")?;
    sess.userauth_pubkey_memory(username, None, private_key_pem, None)
        .context("SSH key auth")?;
    if !sess.authenticated() {
        anyhow::bail!("SSH key authentication failed");
    }
    Ok(sess)
}

fn collect_metrics(sess: &Session) -> Result<SshMetrics> {
    let mut metrics = SshMetrics::default();

    // Hostname
    if let Ok(out) = exec_command(sess, "hostname") {
        let h = out.trim().to_string();
        if !h.is_empty() {
            metrics.hostname = Some(h);
        }
    }

    // OS info
    if let Ok(out) = exec_command(sess, "cat /etc/os-release 2>/dev/null") {
        for line in out.lines() {
            if let Some(val) = line.strip_prefix("NAME=") {
                metrics.os_name = Some(val.trim_matches('"').to_string());
            } else if let Some(val) = line.strip_prefix("VERSION_ID=") {
                metrics.os_version = Some(val.trim_matches('"').to_string());
            }
        }
    }

    // CPU usage — use /proc/stat with a 1-second delta for accuracy
    if let Ok(out) = exec_command(
        sess,
        "cat /proc/stat | head -1; sleep 1; cat /proc/stat | head -1",
    ) {
        metrics.cpu_percent = parse_cpu_percent(&out);
    }

    // Memory
    if let Ok(out) = exec_command(sess, "free -b | awk '/Mem:/ {print $2, $3}'") {
        let parts: Vec<&str> = out.split_whitespace().collect();
        if parts.len() >= 2 {
            metrics.mem_total = parts[0].parse().ok();
            metrics.mem_used = parts[1].parse().ok();
        }
    }

    // Disk (root filesystem)
    if let Ok(out) = exec_command(sess, "df -B1 / | tail -1 | awk '{print $2, $3}'") {
        let parts: Vec<&str> = out.split_whitespace().collect();
        if parts.len() >= 2 {
            metrics.disk_total = parts[0].parse().ok();
            metrics.disk_used = parts[1].parse().ok();
        }
    }

    // Uptime
    if let Ok(out) = exec_command(sess, "cat /proc/uptime | awk '{print $1}'") {
        metrics.uptime_seconds = out.trim().parse::<f64>().ok().map(|v| v as i64);
    }

    Ok(metrics)
}

/// Parse CPU usage percentage from two /proc/stat snapshots.
fn parse_cpu_percent(output: &str) -> Option<f64> {
    let lines: Vec<&str> = output.lines().collect();
    if lines.len() < 2 {
        return None;
    }

    fn parse_stat_line(line: &str) -> Option<(u64, u64)> {
        let parts: Vec<u64> = line
            .split_whitespace()
            .skip(1) // skip "cpu"
            .filter_map(|s| s.parse().ok())
            .collect();
        if parts.len() < 4 {
            return None;
        }
        let total: u64 = parts.iter().sum();
        let idle = parts.get(3).copied().unwrap_or(0);
        Some((total, idle))
    }

    let (total1, idle1) = parse_stat_line(lines[0])?;
    let (total2, idle2) = parse_stat_line(lines[1])?;

    let total_delta = total2.saturating_sub(total1) as f64;
    let idle_delta = idle2.saturating_sub(idle1) as f64;

    if total_delta < 1.0 {
        return None;
    }

    let usage = ((total_delta - idle_delta) / total_delta) * 100.0;
    Some((usage * 100.0).round() / 100.0) // round to 2 decimals
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cpu_percent_valid() {
        let output =
            "cpu  10000 200 3000 50000 100 0 50 0 0 0\ncpu  11000 250 3100 50500 110 0 60 0 0 0\n";
        let result = parse_cpu_percent(output);
        assert!(result.is_some());
        let pct = result.unwrap();
        assert!(
            (0.0..=100.0).contains(&pct),
            "CPU percent {pct} out of range"
        );
    }

    #[test]
    fn test_parse_cpu_percent_single_line() {
        let output = "cpu  10000 200 3000 50000 100 0 50 0 0 0\n";
        assert!(parse_cpu_percent(output).is_none());
    }

    #[test]
    fn test_parse_cpu_percent_empty() {
        assert!(parse_cpu_percent("").is_none());
    }
}
