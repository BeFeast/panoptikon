//! Pure Caddy JSON configuration generation.
//!
//! This module deliberately performs no database or network I/O.  A generated
//! document is a complete Caddy configuration suitable for the atomic `/load`
//! endpoint; callers never patch individual config subtrees.

use std::collections::BTreeSet;
use std::fmt;
use std::net::IpAddr;

use ipnetwork::IpNetwork;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProxyHostRow {
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub tls_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaddyConfigInput {
    pub admin_url: String,
    pub admin_user: String,
    pub admin_password_hash: Option<String>,
    pub admin_listen: String,
    pub lan_ip: String,
    pub admin_gate_port: u32,
    pub admin_allowed_ranges: Vec<String>,
    pub acme_email: String,
    pub acme_ca: Option<String>,
    pub acme_zones: Vec<String>,
    pub dns_provider: String,
    /// A Caddy placeholder, never a credential (for example
    /// `{env.CLOUDFLARE_API_TOKEN}` or `{file./etc/caddy/cf_token}`).
    pub dns_token_placeholder: String,
    pub dns_resolvers: Vec<String>,
    pub hosts: Vec<ProxyHostRow>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    Missing(&'static str),
    Invalid { field: &'static str, message: String },
    ZoneNotAllowed(String),
    InvalidTlsDomain(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing(field) => write!(f, "{field} must not be empty"),
            Self::Invalid { field, message } => write!(f, "invalid {field}: {message}"),
            Self::ZoneNotAllowed(host) => {
                write!(f, "TLS host {host} is not in caddy_acme_zones")
            }
            Self::InvalidTlsDomain(host) => write!(f, "invalid TLS hostname: {host}"),
        }
    }
}

impl std::error::Error for ConfigError {}

#[cfg(test)]
fn split_csv(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

/// Derive the wildcard certificates needed for individual TLS host routes.
///
/// Panoptikon's configured ACME zones are currently two-label registrable
/// domains.  Every subdomain contributes wildcard names down to its zone; the
/// apex itself is only automated when an apex host is explicitly configured.
/// This follows Caddy >= 2.10 wildcard reuse behavior without requesting a
/// redundant certificate for every individual hostname.
pub fn tls_subjects(domains: &[&str], zones: &[String]) -> Result<Vec<String>, ConfigError> {
    let normalized_zones: Vec<String> = zones
        .iter()
        .map(|zone| zone.trim().trim_end_matches('.').to_ascii_lowercase())
        .filter(|zone| !zone.is_empty())
        .collect();
    let mut subjects = BTreeSet::new();

    for raw_domain in domains {
        let domain = raw_domain.trim().trim_end_matches('.').to_ascii_lowercase();
        let labels: Vec<&str> = domain.split('.').collect();
        if labels.len() < 2
            || labels.iter().any(|label| label.is_empty())
            || domain.contains('*')
        {
            return Err(ConfigError::InvalidTlsDomain((*raw_domain).to_string()));
        }

        let zone = if normalized_zones.is_empty() {
            labels[labels.len() - 2..].join(".")
        } else {
            normalized_zones
                .iter()
                .filter(|candidate| {
                    domain == candidate.as_str()
                        || domain.ends_with(&format!(".{candidate}"))
                })
                .max_by_key(|candidate| candidate.len())
                .cloned()
                .ok_or_else(|| ConfigError::ZoneNotAllowed(domain.clone()))?
        };

        if domain == zone {
            subjects.insert(zone);
            continue;
        }

        for index in 1..labels.len() {
            let suffix = labels[index..].join(".");
            if suffix.len() < zone.len() {
                break;
            }
            subjects.insert(format!("*.{suffix}"));
            if suffix == zone {
                break;
            }
        }
    }

    Ok(subjects.into_iter().collect())
}

fn route_for_host(host: &ProxyHostRow) -> Value {
    let mut handler = json!({
        "handler": "reverse_proxy",
        "upstreams": [{ "dial": format!("{}:{}", host.forward_host, host.forward_port) }]
    });
    if host.forward_scheme.eq_ignore_ascii_case("https") {
        handler["transport"] = json!({ "protocol": "http", "tls": {} });
    }

    json!({
        "match": [{ "host": [host.domain] }],
        "handle": [handler]
    })
}

fn port_from_listen(listen: &str) -> u16 {
    listen
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse().ok())
        .unwrap_or(2019)
}

fn admin_authority(admin_url: &str) -> Result<(String, String, bool), ConfigError> {
    let parsed = reqwest::Url::parse(admin_url).map_err(|error| ConfigError::Invalid {
        field: "caddy_admin_url",
        message: error.to_string(),
    })?;
    let host = parsed
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or(ConfigError::Missing("caddy_admin_url host"))?
        .to_string();
    let port = parsed.port_or_known_default().ok_or_else(|| ConfigError::Invalid {
        field: "caddy_admin_url",
        message: "URL must include a port for an unknown scheme".to_string(),
    })?;
    let authority = if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    Ok((host, authority, parsed.scheme() == "https"))
}

fn validate(input: &CaddyConfigInput) -> Result<(IpAddr, String, String, bool), ConfigError> {
    if input.lan_ip.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_lan_ip"));
    }
    let lan_ip = input
        .lan_ip
        .trim()
        .parse::<IpAddr>()
        .map_err(|error| ConfigError::Invalid {
            field: "caddy_lan_ip",
            message: error.to_string(),
        })?;
    if input.admin_user.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_admin_user"));
    }
    if input
        .admin_password_hash
        .as_deref()
        .is_none_or(|hash| hash.trim().is_empty())
    {
        return Err(ConfigError::Missing("caddy_admin_password_hash"));
    }
    if input.admin_allowed_ranges.is_empty() {
        return Err(ConfigError::Missing("caddy_admin_allowed_ranges"));
    }
    for range in &input.admin_allowed_ranges {
        range
            .parse::<IpNetwork>()
            .map_err(|error| ConfigError::Invalid {
                field: "caddy_admin_allowed_ranges",
                message: format!("{range}: {error}"),
            })?;
    }
    if !(1..=u16::MAX as u32).contains(&input.admin_gate_port) {
        return Err(ConfigError::Invalid {
            field: "caddy_admin_gate_port",
            message: "must be between 1 and 65535".to_string(),
        });
    }
    if input.admin_listen.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_admin_listen"));
    }
    if input.dns_provider != "cloudflare" {
        return Err(ConfigError::Invalid {
            field: "caddy_dns_provider",
            message: "only cloudflare is supported".to_string(),
        });
    }
    let placeholder = input.dns_token_placeholder.trim();
    if !(placeholder.starts_with("{env.") || placeholder.starts_with("{file."))
        || !placeholder.ends_with('}')
    {
        return Err(ConfigError::Invalid {
            field: "caddy_dns_token_placeholder",
            message: "must be a {env.NAME} or {file.path} Caddy placeholder".to_string(),
        });
    }

    let (admin_host, authority, gate_uses_tls) = admin_authority(&input.admin_url)?;
    Ok((lan_ip, admin_host, authority, gate_uses_tls))
}

/// Build a complete Caddy JSON document for an atomic `POST /load`.
pub fn build_caddy_config(input: &CaddyConfigInput) -> Result<Value, ConfigError> {
    let (lan_ip, admin_host, admin_url_authority, gate_uses_tls) = validate(input)?;

    let https_hosts: Vec<&ProxyHostRow> = input.hosts.iter().filter(|host| host.tls_enabled).collect();
    let http_hosts: Vec<&ProxyHostRow> = input.hosts.iter().filter(|host| !host.tls_enabled).collect();

    let mut tls_domains: Vec<&str> = https_hosts.iter().map(|host| host.domain.as_str()).collect();
    // The production admin gate is HTTPS and deliberately absent from DNS. It
    // reuses the same DNS-01 wildcard certificate as managed proxy hosts.
    if gate_uses_tls {
        tls_domains.push(admin_host.as_str());
    }
    if !tls_domains.is_empty() && input.acme_email.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_acme_email"));
    }
    let subjects = tls_subjects(&tls_domains, &input.acme_zones)?;

    let listen_port = port_from_listen(input.admin_listen.trim());
    let gate_authority = match lan_ip {
        IpAddr::V4(ip) => format!("{ip}:{}", input.admin_gate_port),
        IpAddr::V6(ip) => format!("[{ip}]:{}", input.admin_gate_port),
    };
    let origins = BTreeSet::from([
        input.admin_listen.trim().to_string(),
        format!("127.0.0.1:{listen_port}"),
        format!("localhost:{listen_port}"),
        format!("[::1]:{listen_port}"),
        gate_authority.clone(),
        admin_url_authority,
    ]);
    // BTreeSet gives deterministic output and removes aliases that collapse to
    // the same authority (common in CI's loopback configuration).
    let origins: Vec<String> = origins.iter().cloned().collect();

    let gate_auto_https = if gate_uses_tls {
        json!({ "disable_redirects": true })
    } else {
        json!({ "disable": true })
    };
    let gate = json!({
        "listen": [gate_authority],
        "automatic_https": gate_auto_https,
        "routes": [
            {
                "match": [{
                    "host": [admin_host],
                    "remote_ip": { "ranges": input.admin_allowed_ranges }
                }],
                "handle": [
                    {
                        "handler": "authentication",
                        "providers": {
                            "http_basic": {
                                "hash": { "algorithm": "bcrypt" },
                                "accounts": [{
                                    "username": input.admin_user,
                                    "password": input.admin_password_hash.as_deref().unwrap_or_default()
                                }],
                                "hash_cache": {}
                            }
                        }
                    },
                    {
                        "handler": "reverse_proxy",
                        "upstreams": [{ "dial": input.admin_listen }],
                        "headers": {
                            "request": {
                                "set": { "Host": [input.admin_listen] }
                            }
                        }
                    }
                ],
                "terminal": true
            },
            {
                "handle": [{
                    "handler": "static_response",
                    "status_code": 403,
                    "close": true
                }]
            }
        ]
    });

    let https_routes: Vec<Value> = https_hosts.into_iter().map(route_for_host).collect();
    let http_routes: Vec<Value> = http_hosts.into_iter().map(route_for_host).collect();
    let mut document = json!({
        "admin": {
            "listen": input.admin_listen,
            "origins": origins
        },
        "apps": {
            "http": {
                "servers": {
                    "https": {
                        "listen": [":443"],
                        "routes": https_routes
                    },
                    "http": {
                        "listen": [":80"],
                        "automatic_https": { "disable": true },
                        "routes": http_routes
                    },
                    "admin_gate": gate
                }
            }
        }
    });

    if gate_uses_tls {
        // An explicit non-443 listener is not inferred to be TLS from the JSON
        // route alone. The empty policy enables TLS while certificate selection
        // reuses the DNS-01 wildcard managed in `apps.tls`.
        document["apps"]["http"]["servers"]["admin_gate"]
            ["tls_connection_policies"] = json!([{}]);
    }

    if !subjects.is_empty() {
        let mut issuer = json!({
            "module": "acme",
            "email": input.acme_email,
            "challenges": {
                "dns": {
                    "provider": {
                        "name": input.dns_provider,
                        "api_token": input.dns_token_placeholder
                    },
                    "resolvers": input.dns_resolvers,
                    "propagation_delay": "20s",
                    "propagation_timeout": -1
                }
            }
        });
        if let Some(ca) = input.acme_ca.as_deref().filter(|ca| !ca.trim().is_empty()) {
            issuer["ca"] = json!(ca);
        }
        document["apps"]["tls"] = json!({
            "certificates": { "automate": subjects },
            "automation": {
                "policies": [
                    { "subjects": subjects, "issuers": [issuer.clone()] },
                    { "issuers": [issuer] }
                ]
            }
        });
    }

    Ok(document)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> CaddyConfigInput {
        CaddyConfigInput {
            admin_url: "https://caddy-admin.oklabs.uk:2019".into(),
            admin_user: "panoptikon".into(),
            admin_password_hash: Some("$2b$04$fixed-test-hash".into()),
            admin_listen: "127.0.0.1:2019".into(),
            lan_ip: "10.10.0.32".into(),
            admin_gate_port: 2019,
            admin_allowed_ranges: vec![
                "10.10.0.22/32".into(),
                "10.10.0.32/32".into(),
                "127.0.0.1/32".into(),
            ],
            acme_email: "oleg@example.test".into(),
            acme_ca: None,
            acme_zones: vec!["oklabs.uk".into()],
            dns_provider: "cloudflare".into(),
            dns_token_placeholder: "{file./etc/caddy/cf_token}".into(),
            dns_resolvers: vec!["1.1.1.1:53".into(), "8.8.8.8:53".into()],
            hosts: Vec::new(),
        }
    }

    #[test]
    fn subjects_use_wildcards_and_only_explicit_apexes() {
        assert_eq!(
            tls_subjects(
                &["git.oklabs.uk", "a.b.oklabs.uk"],
                &["oklabs.uk".into()]
            )
            .unwrap(),
            vec!["*.b.oklabs.uk", "*.oklabs.uk"]
        );
        assert_eq!(
            tls_subjects(&["oklabs.uk"], &["oklabs.uk".into()]).unwrap(),
            vec!["oklabs.uk"]
        );
    }

    #[test]
    fn subjects_validate_domains_and_zone_allow_list() {
        assert!(matches!(
            tls_subjects(&["plex.ok"], &["oklabs.uk".into()]),
            Err(ConfigError::ZoneNotAllowed(_))
        ));
        assert_eq!(
            tls_subjects(&["plex.ok"], &[]).unwrap(),
            vec!["plex.ok"]
        );
        assert!(matches!(
            tls_subjects(&["localhost"], &[]),
            Err(ConfigError::InvalidTlsDomain(_))
        ));
    }

    #[test]
    fn production_gate_and_dns_policy_shape_are_exact() {
        let config = build_caddy_config(&input()).unwrap();
        let gate = &config["apps"]["http"]["servers"]["admin_gate"];
        assert_eq!(gate["listen"], json!(["10.10.0.32:2019"]));
        assert_eq!(gate["automatic_https"], json!({"disable_redirects": true}));
        assert_eq!(gate["tls_connection_policies"], json!([{}]));
        assert_eq!(
            gate["routes"][0]["match"][0],
            json!({
                "host": ["caddy-admin.oklabs.uk"],
                "remote_ip": {"ranges": ["10.10.0.22/32", "10.10.0.32/32", "127.0.0.1/32"]}
            })
        );
        assert_eq!(
            gate["routes"][0]["handle"][1]["headers"]["request"]["set"]["Host"],
            json!(["127.0.0.1:2019"])
        );
        assert_eq!(gate["routes"][0]["terminal"], true);
        assert_eq!(gate["routes"][1]["handle"][0]["status_code"], 403);
        assert_eq!(gate["routes"][1]["handle"][0]["close"], true);

        let dns = &config["apps"]["tls"]["automation"]["policies"][0]["issuers"][0]
            ["challenges"]["dns"];
        assert_eq!(dns["provider"]["api_token"], "{file./etc/caddy/cf_token}");
        assert_eq!(dns["resolvers"], json!(["1.1.1.1:53", "8.8.8.8:53"]));
        assert_eq!(dns["propagation_delay"], "20s");
        assert_eq!(dns["propagation_timeout"], -1);
        assert_eq!(
            config["apps"]["tls"]["certificates"]["automate"],
            json!(["*.oklabs.uk"])
        );
        assert!(config.to_string().find("prefer_wildcard").is_none());
    }

    #[test]
    fn routes_are_split_by_tls_and_https_upstreams_keep_transport() {
        let mut value = input();
        value.hosts = vec![
            ProxyHostRow {
                domain: "git.oklabs.uk".into(),
                forward_host: "10.10.0.20".into(),
                forward_port: 3000,
                forward_scheme: "http".into(),
                tls_enabled: true,
            },
            ProxyHostRow {
                domain: "plex.ok".into(),
                forward_host: "10.10.0.15".into(),
                forward_port: 32400,
                forward_scheme: "https".into(),
                tls_enabled: false,
            },
        ];
        let config = build_caddy_config(&value).unwrap();
        let servers = &config["apps"]["http"]["servers"];
        assert_eq!(servers["https"]["routes"][0]["match"][0]["host"][0], "git.oklabs.uk");
        assert_eq!(servers["http"]["routes"][0]["match"][0]["host"][0], "plex.ok");
        assert_eq!(servers["http"]["automatic_https"]["disable"], true);
        assert!(servers["http"]["routes"][0]["handle"][0]["transport"]["tls"].is_object());
    }

    #[test]
    fn validation_is_unconditional_and_deterministic() {
        let good = input();
        let first = build_caddy_config(&good).unwrap();
        let second = build_caddy_config(&good).unwrap();
        assert_eq!(first, second);
        assert_eq!(serde_json::to_vec(&first).unwrap(), serde_json::to_vec(&second).unwrap());

        let mut cases: Vec<(&str, Box<dyn Fn(&mut CaddyConfigInput)>)> = vec![
            ("caddy_lan_ip", Box::new(|v| v.lan_ip.clear())),
            ("caddy_lan_ip", Box::new(|v| v.lan_ip = "not-an-ip".into())),
            ("caddy_admin_user", Box::new(|v| v.admin_user.clear())),
            ("caddy_admin_password_hash", Box::new(|v| v.admin_password_hash = None)),
            ("caddy_admin_allowed_ranges", Box::new(|v| v.admin_allowed_ranges.clear())),
            ("caddy_admin_allowed_ranges", Box::new(|v| v.admin_allowed_ranges = vec!["bad".into()])),
            ("caddy_admin_gate_port", Box::new(|v| v.admin_gate_port = 0)),
            ("caddy_admin_listen", Box::new(|v| v.admin_listen.clear())),
        ];
        for (field, mutate) in cases.drain(..) {
            let mut invalid = good.clone();
            mutate(&mut invalid);
            assert!(
                build_caddy_config(&invalid).unwrap_err().to_string().contains(field),
                "expected validation error for {field}"
            );
        }
    }

    #[test]
    fn invalid_admin_listen_is_left_for_caddy_to_validate() {
        let mut value = input();
        value.admin_listen = "not::an::address".into();
        assert!(build_caddy_config(&value).is_ok());
    }

    #[test]
    fn csv_helper_discards_empty_items() {
        assert_eq!(split_csv(" one, ,two "), vec!["one", "two"]);
    }
}
