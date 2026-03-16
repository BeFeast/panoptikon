//! pfSense SSH bridge client.
//!
//! Connects to a pfSense box via SSH, uploads the PHP bridge script,
//! and executes actions through it. Follows the same cache pattern as MikroTik.

use anyhow::{Context, Result};
use dashmap::DashMap;
use serde_json::Value;
use ssh2::Session;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

use super::bridge::BRIDGE_PHP;
use super::types::*;

/// Default TTL for cached responses (30 seconds).
const CACHE_TTL: Duration = Duration::from_secs(30);

/// Remote path where the bridge script is uploaded.
/// Placed in /root (owner-only writable) to prevent TOCTOU attacks
/// that would be possible in world-writable /tmp.
const BRIDGE_REMOTE_PATH: &str = "/root/.panoptikon-bridge.php";

/// A cache entry: the JSON value and the instant it was stored.
struct CacheEntry {
    value: Value,
    inserted: Instant,
}

/// Thread-safe TTL cache for pfSense bridge responses.
pub struct PfsenseCache {
    map: DashMap<String, CacheEntry>,
    ttl: Duration,
}

impl PfsenseCache {
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
            ttl: CACHE_TTL,
        }
    }

    pub fn get(&self, key: &str) -> Option<Value> {
        let entry = self.map.get(key)?;
        if entry.inserted.elapsed() < self.ttl {
            Some(entry.value.clone())
        } else {
            drop(entry);
            self.map.remove(key);
            None
        }
    }

    pub fn set(&self, key: String, value: Value) {
        self.map.insert(
            key,
            CacheEntry {
                value,
                inserted: Instant::now(),
            },
        );
    }

    pub fn clear(&self) {
        self.map.clear();
    }
}

impl Default for PfsenseCache {
    fn default() -> Self {
        Self::new()
    }
}

/// SSH authentication method.
#[derive(Debug, Clone)]
pub enum PfsenseAuth {
    Password(String),
    Key(String),
    Agent,
}

/// Client for interacting with pfSense via SSH + PHP bridge.
#[derive(Debug, Clone)]
pub struct PfsenseClient {
    host: String,
    port: u16,
    username: String,
    auth: PfsenseAuth,
}

impl PfsenseClient {
    pub fn new(host: &str, port: u16, username: &str, auth: PfsenseAuth) -> Self {
        Self {
            host: host.to_string(),
            port,
            username: username.to_string(),
            auth,
        }
    }

    /// Establish an SSH session with the pfSense box.
    fn connect(&self) -> Result<Session> {
        let addr = format!("{}:{}", self.host, self.port);
        let tcp = TcpStream::connect_timeout(
            &addr
                .parse()
                .with_context(|| format!("invalid address: {addr}"))?,
            Duration::from_secs(10),
        )
        .with_context(|| format!("TCP connect to {addr}"))?;
        tcp.set_read_timeout(Some(Duration::from_secs(30)))?;
        tcp.set_write_timeout(Some(Duration::from_secs(30)))?;

        let mut sess = Session::new().context("create SSH session")?;
        sess.set_tcp_stream(tcp);
        sess.handshake().context("SSH handshake")?;
        // TODO: Host key verification is not implemented (same trade-off as MikroTik's
        // danger_accept_invalid_certs). For production, consider TOFU or pinned fingerprints.

        match &self.auth {
            PfsenseAuth::Password(pw) => {
                sess.userauth_password(&self.username, pw)
                    .context("SSH password auth")?;
            }
            PfsenseAuth::Key(key) => {
                sess.userauth_pubkey_memory(&self.username, None, key, None)
                    .context("SSH key auth")?;
            }
            PfsenseAuth::Agent => {
                let mut agent = sess.agent().context("SSH agent init")?;
                agent.connect().context("SSH agent connect")?;
                agent
                    .list_identities()
                    .context("SSH agent list identities")?;
                let identities = agent.identities().context("SSH agent get identities")?;
                let mut authed = false;
                for identity in identities {
                    if agent.userauth(&self.username, &identity).is_ok() {
                        authed = true;
                        break;
                    }
                }
                if !authed {
                    anyhow::bail!(
                        "SSH agent auth failed — no matching key for {}@{}",
                        self.username,
                        self.host
                    );
                }
            }
        }

        if !sess.authenticated() {
            anyhow::bail!(
                "SSH authentication failed for {}@{}",
                self.username,
                self.host
            );
        }

        Ok(sess)
    }

    /// Run a single command over the SSH session and return stdout.
    fn exec_command(sess: &Session, cmd: &str) -> Result<String> {
        let mut channel = sess.channel_session().context("open channel")?;
        channel.exec(cmd).context("exec command")?;
        let mut output = String::new();
        channel.read_to_string(&mut output).context("read stdout")?;
        channel.wait_close().ok();
        Ok(output)
    }

    /// Upload the bridge script to the pfSense box if it's not already there
    /// or if the content has changed.
    fn ensure_bridge(sess: &Session) -> Result<()> {
        let expected_hash = sha2_hex(BRIDGE_PHP.as_bytes());

        // Check if bridge exists and has correct hash
        // FreeBSD uses sha256(1), not sha256sum
        let check = Self::exec_command(
            sess,
            &format!("sha256 -q {} 2>/dev/null", BRIDGE_REMOTE_PATH),
        );

        if let Ok(remote_hash) = check {
            if remote_hash.trim() == expected_hash {
                return Ok(());
            }
        }

        // Upload via SCP
        let data = BRIDGE_PHP.as_bytes();
        let mut remote_file = sess
            .scp_send(
                std::path::Path::new(BRIDGE_REMOTE_PATH),
                0o600,
                data.len() as u64,
                None,
            )
            .context("SCP send")?;
        remote_file.write_all(data).context("write bridge script")?;
        remote_file.send_eof().context("send EOF")?;
        remote_file.wait_eof().context("wait EOF")?;
        remote_file.close().context("close SCP channel")?;
        remote_file.wait_close().context("wait SCP close")?;

        tracing::info!(
            "Uploaded bridge script to pfSense {}:{}",
            BRIDGE_REMOTE_PATH,
            expected_hash
        );
        Ok(())
    }

    /// Execute a bridge action, optionally with a JSON payload.
    /// Payload is written to the remote process's stdin (not passed as argv).
    fn execute_bridge(&self, action: &str, payload: Option<&Value>) -> Result<BridgeResponse> {
        let sess = self.connect()?;
        Self::ensure_bridge(&sess)?;

        let cmd = format!("php-cgi -f {} -- {}", BRIDGE_REMOTE_PATH, action);

        let start = Instant::now();

        let mut channel = sess.channel_session().context("open channel")?;
        channel.exec(&cmd).context("exec command")?;

        // Write JSON payload to stdin
        if let Some(p) = payload {
            let json_bytes = serde_json::to_vec(p)?;
            channel
                .write_all(&json_bytes)
                .context("write payload to stdin")?;
        }
        // Close stdin to signal EOF to php-cgi
        channel.send_eof().context("send EOF")?;

        let mut output = String::new();
        channel.read_to_string(&mut output).context("read stdout")?;
        channel.wait_close().ok();

        let elapsed = start.elapsed();

        tracing::info!(
            action,
            elapsed_ms = elapsed.as_millis() as u64,
            "pfSense bridge response"
        );

        // Strip any non-JSON output before the first '{'
        let json_start = output
            .find('{')
            .with_context(|| format!("no JSON in bridge output for action '{action}': {output}"))?;
        let json_str = &output[json_start..];

        let resp: BridgeResponse = serde_json::from_str(json_str).with_context(|| {
            format!("failed to parse bridge JSON for action '{action}': {json_str}")
        })?;

        if !resp.success {
            let err_msg = resp
                .error
                .unwrap_or_else(|| "unknown bridge error".to_string());
            anyhow::bail!("pfSense bridge error ({}): {}", action, err_msg);
        }

        Ok(resp)
    }

    /// Execute bridge and extract the data field.
    fn bridge_data(&self, action: &str, payload: Option<&Value>) -> Result<Value> {
        let resp = self.execute_bridge(action, payload)?;
        resp.data
            .with_context(|| format!("bridge action '{action}' returned no data"))
    }

    /// Test SSH connection to pfSense.
    pub fn test_connection(&self) -> Result<()> {
        let sess = self.connect()?;
        Self::ensure_bridge(&sess)?;
        let _ = Self::exec_command(&sess, "echo ok")?;
        Ok(())
    }

    // ── Read-only actions ──

    pub fn status(&self) -> Result<PfsenseSystemInfo> {
        let val = self.bridge_data("status", None)?;
        serde_json::from_value(val).context("parse pfSense status")
    }

    pub fn interfaces(&self) -> Result<Vec<PfsenseInterface>> {
        let val = self.bridge_data("interfaces", None)?;
        serde_json::from_value(val).context("parse pfSense interfaces")
    }

    pub fn gateways(&self) -> Result<Vec<PfsenseGateway>> {
        let val = self.bridge_data("gateways", None)?;
        serde_json::from_value(val).context("parse pfSense gateways")
    }

    pub fn routes(&self) -> Result<Vec<PfsenseRoute>> {
        let val = self.bridge_data("routes", None)?;
        serde_json::from_value(val).context("parse pfSense routes")
    }

    pub fn dhcp_leases(&self) -> Result<Vec<PfsenseDhcpLease>> {
        let val = self.bridge_data("dhcp_leases", None)?;
        serde_json::from_value(val).context("parse pfSense DHCP leases")
    }

    pub fn dhcp_static_mappings(&self) -> Result<Vec<PfsenseDhcpStaticMapping>> {
        let val = self.bridge_data("dhcp_static_mappings", None)?;
        serde_json::from_value(val).context("parse pfSense DHCP static mappings")
    }

    pub fn firewall_rules(&self) -> Result<Vec<PfsenseFirewallRule>> {
        let val = self.bridge_data("firewall_rules", None)?;
        serde_json::from_value(val).context("parse pfSense firewall rules")
    }

    pub fn nat_rules(&self) -> Result<Vec<PfsenseNatRule>> {
        let val = self.bridge_data("nat_rules", None)?;
        serde_json::from_value(val).context("parse pfSense NAT rules")
    }

    pub fn aliases(&self) -> Result<Vec<PfsenseAlias>> {
        let val = self.bridge_data("aliases", None)?;
        serde_json::from_value(val).context("parse pfSense aliases")
    }

    pub fn dns_config(&self) -> Result<PfsenseDnsConfig> {
        let val = self.bridge_data("dns_config", None)?;
        serde_json::from_value(val).context("parse pfSense DNS config")
    }

    pub fn dns_overrides(&self) -> Result<Vec<PfsenseDnsOverride>> {
        let val = self.bridge_data("dns_overrides", None)?;
        serde_json::from_value(val).context("parse pfSense DNS overrides")
    }

    pub fn arp_table(&self) -> Result<Value> {
        self.bridge_data("arp_table", None)
    }

    // ── Mutation actions ──

    pub fn interface_toggle(&self, interface: &str, enable: bool) -> Result<Value> {
        let payload = serde_json::json!({ "interface": interface, "enable": enable });
        self.bridge_data("interface_toggle", Some(&payload))
    }

    pub fn route_create(
        &self,
        network: &str,
        gateway: &str,
        interface: Option<&str>,
    ) -> Result<Value> {
        let mut payload = serde_json::json!({ "network": network, "gateway": gateway });
        if let Some(iface) = interface {
            payload["interface"] = serde_json::Value::String(iface.to_string());
        }
        self.bridge_data("route_create", Some(&payload))
    }

    pub fn route_delete(&self, network: &str) -> Result<Value> {
        let payload = serde_json::json!({ "network": network });
        self.bridge_data("route_delete", Some(&payload))
    }

    pub fn dhcp_static_create(&self, data: &Value) -> Result<Value> {
        self.bridge_data("dhcp_static_create", Some(data))
    }

    pub fn dhcp_static_delete(&self, id: &str) -> Result<Value> {
        let payload = serde_json::json!({ "id": id });
        self.bridge_data("dhcp_static_delete", Some(&payload))
    }

    pub fn firewall_rule_create(&self, data: &Value) -> Result<Value> {
        self.bridge_data("firewall_rule_create", Some(data))
    }

    pub fn firewall_rule_update(&self, data: &Value) -> Result<Value> {
        self.bridge_data("firewall_rule_update", Some(data))
    }

    pub fn firewall_rule_delete(&self, id: &str) -> Result<Value> {
        let payload = serde_json::json!({ "id": id });
        self.bridge_data("firewall_rule_delete", Some(&payload))
    }

    pub fn nat_rule_create(&self, data: &Value) -> Result<Value> {
        self.bridge_data("nat_rule_create", Some(data))
    }

    pub fn nat_rule_update(&self, data: &Value) -> Result<Value> {
        self.bridge_data("nat_rule_update", Some(data))
    }

    pub fn nat_rule_delete(&self, id: &str) -> Result<Value> {
        let payload = serde_json::json!({ "id": id });
        self.bridge_data("nat_rule_delete", Some(&payload))
    }

    pub fn alias_create(&self, data: &Value) -> Result<Value> {
        self.bridge_data("alias_create", Some(data))
    }

    pub fn alias_update(&self, data: &Value) -> Result<Value> {
        self.bridge_data("alias_update", Some(data))
    }

    pub fn alias_delete(&self, name: &str) -> Result<Value> {
        let payload = serde_json::json!({ "name": name });
        self.bridge_data("alias_delete", Some(&payload))
    }

    pub fn dns_override_create(&self, data: &Value) -> Result<Value> {
        self.bridge_data("dns_override_create", Some(data))
    }

    pub fn dns_override_delete(&self, id: &str) -> Result<Value> {
        let payload = serde_json::json!({ "id": id });
        self.bridge_data("dns_override_delete", Some(&payload))
    }

    // ── Config management ──

    pub fn config_snapshot(&self) -> Result<Value> {
        self.bridge_data("config_snapshot", None)
    }

    pub fn config_current(&self) -> Result<Value> {
        self.bridge_data("config_current", None)
    }

    pub fn config_diff(&self, old_b64: &str, new_b64: Option<&str>) -> Result<Value> {
        let mut payload = serde_json::json!({ "old": old_b64 });
        if let Some(new) = new_b64 {
            payload["new"] = serde_json::Value::String(new.to_string());
        }
        self.bridge_data("config_diff", Some(&payload))
    }

    pub fn config_list_backups(&self) -> Result<Value> {
        self.bridge_data("config_list_backups", None)
    }

    pub fn config_restore(&self, content_b64: &str) -> Result<Value> {
        let payload = serde_json::json!({ "content": content_b64 });
        self.bridge_data("config_restore", Some(&payload))
    }
}

/// Compute SHA-256 hex digest of bytes.
fn sha2_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(data);
    hash.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_get_returns_none_when_empty() {
        let cache = PfsenseCache::new();
        assert!(cache.get("status").is_none());
    }

    #[test]
    fn cache_set_then_get_returns_value() {
        let cache = PfsenseCache::new();
        let val = serde_json::json!({"hostname": "pfsense"});
        cache.set("status".into(), val.clone());
        assert_eq!(cache.get("status"), Some(val));
    }

    #[test]
    fn cache_clear_removes_everything() {
        let cache = PfsenseCache::new();
        cache.set("a".into(), Value::Null);
        cache.set("b".into(), Value::Null);
        cache.clear();
        assert!(cache.get("a").is_none());
        assert!(cache.get("b").is_none());
    }
}
