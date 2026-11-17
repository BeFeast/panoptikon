use std::{
    collections::BTreeSet,
    fmt,
    net::{IpAddr, SocketAddr},
};

use ipnetwork::IpNetwork;
use serde_json::{json, Value};

/// A proxy host already filtered to `enabled = 1` and ordered by domain.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProxyHostRow {
    pub domain: String,
    pub forward_host: String,
    pub forward_port: u16,
    pub forward_scheme: String,
    pub tls_enabled: bool,
}

/// All values required to generate a complete Caddy JSON document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CaddyConfigInput {
    pub admin_url: String,
    pub admin_listen: String,
    pub admin_user: String,
    pub admin_password_hash: Option<String>,
    pub lan_ip: String,
    pub admin_gate_port: u16,
    pub admin_allowed_ranges: Vec<String>,
    pub acme_email: String,
    pub acme_ca: Option<String>,
    pub acme_zones: Vec<String>,
    pub dns_provider: String,
    /// A complete Caddy placeholder, for example `{env.CLOUDFLARE_API_TOKEN}`
    /// or the production-safe `{file./etc/caddy/cf_token}`.
    pub dns_token_placeholder: String,
    pub dns_resolvers: Vec<String>,
    pub dns_propagation_delay: String,
    pub hosts: Vec<ProxyHostRow>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConfigError {
    Missing(&'static str),
    InvalidLanIp(String),
    InvalidAllowedRange(String),
    InvalidGatePort(u16),
    InvalidAdminUrl(String),
    InvalidDomain(String),
    ZoneNotAllowed(String),
    UnsupportedDnsProvider(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Missing(key) => write!(f, "{key} is required"),
            Self::InvalidLanIp(value) => {
                write!(f, "caddy_lan_ip must be a valid IP address: {value}")
            }
            Self::InvalidAllowedRange(value) => write!(
                f,
                "caddy_admin_allowed_ranges contains an invalid CIDR: {value}"
            ),
            Self::InvalidGatePort(port) => write!(
                f,
                "caddy_admin_gate_port must be between 1 and 65535 (got {port})"
            ),
            Self::InvalidAdminUrl(value) => {
                write!(
                    f,
                    "caddy_admin_url must be an absolute HTTP(S) URL: {value}"
                )
            }
            Self::InvalidDomain(value) => write!(f, "invalid TLS hostname: {value}"),
            Self::ZoneNotAllowed(value) => {
                write!(f, "TLS hostname is outside caddy_acme_zones: {value}")
            }
            Self::UnsupportedDnsProvider(value) => {
                write!(f, "caddy_dns_provider must be cloudflare (got {value})")
            }
        }
    }
}

impl std::error::Error for ConfigError {}

/// Derive wildcard certificate subjects for TLS hostnames.
///
/// The configured zones are deliberately treated as two-label registrable
/// domains. That matches Panoptikon's production zones and avoids silently
/// pretending to implement a public-suffix database. Subdomains contribute a
/// wildcard for their parent. The apex itself is added only when the apex is an
/// actual configured host because wildcard certificates do not cover it.
pub fn tls_subjects(domains: &[&str], zones: &[String]) -> Result<Vec<String>, ConfigError> {
    let allowed: BTreeSet<String> = zones
        .iter()
        .map(|zone| zone.trim().trim_end_matches('.').to_ascii_lowercase())
        .filter(|zone| !zone.is_empty())
        .collect();
    let mut subjects = BTreeSet::new();

    for raw_domain in domains {
        let domain = raw_domain.trim().trim_end_matches('.').to_ascii_lowercase();
        let labels: Vec<&str> = domain.split('.').collect();
        if labels.len() < 2
            || labels.iter().any(|label| {
                label.is_empty()
                    || *label == "*"
                    || label.starts_with('-')
                    || label.ends_with('-')
                    || !label
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            })
        {
            return Err(ConfigError::InvalidDomain(raw_domain.to_string()));
        }

        let zone = labels[labels.len() - 2..].join(".");
        if !allowed.is_empty() && !allowed.contains(&zone) {
            return Err(ConfigError::ZoneNotAllowed(domain));
        }

        if labels.len() == 2 {
            subjects.insert(domain.clone());
            subjects.insert(format!("*.{domain}"));
        } else {
            subjects.insert(format!("*.{}", labels[1..].join(".")));
        }
    }

    Ok(subjects.into_iter().collect())
}

/// Build a deterministic, complete Caddy configuration document.
pub fn build_caddy_config(input: &CaddyConfigInput) -> Result<Value, ConfigError> {
    let lan_ip: IpAddr = if input.lan_ip.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_lan_ip"));
    } else {
        input
            .lan_ip
            .trim()
            .parse()
            .map_err(|_| ConfigError::InvalidLanIp(input.lan_ip.clone()))?
    };

    if input.admin_user.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_admin_user"));
    }
    let password_hash = input
        .admin_password_hash
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or(ConfigError::Missing("caddy_admin_password_hash"))?;
    if input.admin_allowed_ranges.is_empty() {
        return Err(ConfigError::Missing("caddy_admin_allowed_ranges"));
    }
    for range in &input.admin_allowed_ranges {
        range
            .parse::<IpNetwork>()
            .map_err(|_| ConfigError::InvalidAllowedRange(range.clone()))?;
    }
    if input.admin_gate_port == 0 {
        return Err(ConfigError::InvalidGatePort(input.admin_gate_port));
    }
    if input.admin_listen.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_admin_listen"));
    }
    if input.dns_provider != "cloudflare" {
        return Err(ConfigError::UnsupportedDnsProvider(
            input.dns_provider.clone(),
        ));
    }
    if input.dns_token_placeholder.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_dns_token_placeholder"));
    }

    let admin_url = reqwest::Url::parse(input.admin_url.trim())
        .map_err(|_| ConfigError::InvalidAdminUrl(input.admin_url.clone()))?;
    if !matches!(admin_url.scheme(), "http" | "https") || admin_url.host_str().is_none() {
        return Err(ConfigError::InvalidAdminUrl(input.admin_url.clone()));
    }

    let https_gate = admin_url.scheme() == "https";
    let admin_host = admin_url
        .host_str()
        .expect("validated URL has a host")
        .to_ascii_lowercase();

    let mut tls_domains: Vec<&str> = input
        .hosts
        .iter()
        .filter(|host| host.tls_enabled)
        .map(|host| host.domain.as_str())
        .collect();
    if https_gate && admin_host.parse::<IpAddr>().is_err() {
        tls_domains.push(&admin_host);
    }
    let subjects = tls_subjects(&tls_domains, &input.acme_zones)?;
    if !subjects.is_empty() && input.acme_email.trim().is_empty() {
        return Err(ConfigError::Missing("caddy_acme_email"));
    }

    let https_routes: Vec<Value> = input
        .hosts
        .iter()
        .filter(|host| host.tls_enabled)
        .map(proxy_route)
        .collect();
    let http_routes: Vec<Value> = input
        .hosts
        .iter()
        .filter(|host| !host.tls_enabled)
        .map(proxy_route)
        .collect();

    let gate_match = if https_gate {
        json!({
            "host": [admin_host],
            "remote_ip": { "ranges": input.admin_allowed_ranges }
        })
    } else {
        json!({ "remote_ip": { "ranges": input.admin_allowed_ranges } })
    };

    let gate_auto_https = if https_gate {
        json!({ "disable_redirects": true })
    } else {
        json!({ "disable": true, "disable_redirects": true })
    };
    let gate_listen = SocketAddr::new(lan_ip, input.admin_gate_port).to_string();
    let admin_origins = admin_origins(input, &admin_url, lan_ip);

    let mut document = json!({
        "admin": {
            "listen": input.admin_listen,
            "origins": admin_origins
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
                    "admin_gate": {
                        "listen": [gate_listen],
                        "automatic_https": gate_auto_https,
                        "routes": [
                            {
                                "match": [gate_match],
                                "handle": [
                                    {
                                        "handler": "authentication",
                                        "providers": {
                                            "http_basic": {
                                                "hash": { "algorithm": "bcrypt" },
                                                "accounts": [{
                                                    "username": input.admin_user,
                                                    "password": password_hash
                                                }],
                                                "realm": "caddy-admin",
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
                                }],
                                "terminal": true
                            }
                        ]
                    }
                }
            }
        }
    });

    if !subjects.is_empty() {
        let issuer = acme_issuer(input);
        document["apps"]["tls"] = json!({
            "certificates": { "automate": subjects },
            "automation": {
                "policies": [
                    {
                        "subjects": subjects,
                        "issuers": [issuer]
                    },
                    {
                        "issuers": [acme_issuer(input)]
                    }
                ]
            }
        });
    }

    Ok(document)
}

fn proxy_route(host: &ProxyHostRow) -> Value {
    let mut handler = json!({
        "handler": "reverse_proxy",
        "upstreams": [{ "dial": format!("{}:{}", host.forward_host, host.forward_port) }]
    });
    if host.forward_scheme.eq_ignore_ascii_case("https") {
        handler["transport"] = json!({ "protocol": "http", "tls": {} });
    }
    json!({
        "match": [{ "host": [host.domain] }],
        "handle": [handler],
        "terminal": true
    })
}

fn acme_issuer(input: &CaddyConfigInput) -> Value {
    let mut issuer = json!({
        "module": "acme",
        "email": input.acme_email,
        "challenges": {
            "dns": {
                "provider": {
                    "name": "cloudflare",
                    "api_token": input.dns_token_placeholder
                },
                "resolvers": input.dns_resolvers,
                "propagation_delay": input.dns_propagation_delay,
                "propagation_timeout": -1
            }
        }
    });
    if let Some(ca) = input.acme_ca.as_deref().filter(|value| !value.is_empty()) {
        issuer["ca"] = json!(ca);
    }
    issuer
}

fn admin_origins(
    input: &CaddyConfigInput,
    admin_url: &reqwest::Url,
    lan_ip: IpAddr,
) -> Vec<String> {
    let listen_port = input
        .admin_listen
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse::<u16>().ok())
        .or_else(|| admin_url.port_or_known_default())
        .unwrap_or(2019);

    let mut origins = BTreeSet::new();
    origins.insert(input.admin_listen.clone());
    origins.insert(format!("127.0.0.1:{listen_port}"));
    origins.insert(format!("localhost:{listen_port}"));
    origins.insert(format!("[::1]:{listen_port}"));
    origins.insert(SocketAddr::new(lan_ip, input.admin_gate_port).to_string());
    if let Some(host) = admin_url.host_str() {
        let port = admin_url
            .port_or_known_default()
            .unwrap_or(input.admin_gate_port);
        let authority = match host.parse::<IpAddr>() {
            Ok(ip) => SocketAddr::new(ip, port).to_string(),
            Err(_) => format!("{host}:{port}"),
        };
        origins.insert(authority);
    }
    origins.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> CaddyConfigInput {
        CaddyConfigInput {
            admin_url: "http://localhost:2019".into(),
            admin_listen: "127.0.0.1:2019".into(),
            admin_user: "panoptikon".into(),
            admin_password_hash: Some(
                "$2b$04$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuu".into(),
            ),
            lan_ip: "127.0.0.1".into(),
            admin_gate_port: 2029,
            admin_allowed_ranges: vec!["127.0.0.1/32".into()],
            acme_email: "ci@example.test".into(),
            acme_ca: Some("https://127.0.0.1:9/directory".into()),
            acme_zones: vec![],
            dns_provider: "cloudflare".into(),
            dns_token_placeholder: "{env.CLOUDFLARE_API_TOKEN}".into(),
            dns_resolvers: vec!["1.1.1.1:53".into(), "8.8.8.8:53".into()],
            dns_propagation_delay: "20s".into(),
            hosts: vec![],
        }
    }

    fn host(domain: &str, tls_enabled: bool) -> ProxyHostRow {
        ProxyHostRow {
            domain: domain.into(),
            forward_host: "10.0.0.2".into(),
            forward_port: 8080,
            forward_scheme: "http".into(),
            tls_enabled,
        }
    }

    #[test]
    fn tls_subject_derivation_is_sorted_and_deduplicated() {
        assert_eq!(
            tls_subjects(&["git.oklabs.uk", "a.b.oklabs.uk", "git.oklabs.uk"], &[]).unwrap(),
            vec!["*.b.oklabs.uk", "*.oklabs.uk"]
        );
        assert_eq!(
            tls_subjects(&["oklabs.uk"], &[]).unwrap(),
            vec!["*.oklabs.uk", "oklabs.uk"]
        );
    }

    #[test]
    fn tls_subject_validation_honours_zone_allow_list() {
        let zones = vec!["oklabs.uk".to_string()];
        assert_eq!(
            tls_subjects(&["plex.ok"], &zones),
            Err(ConfigError::ZoneNotAllowed("plex.ok".into()))
        );
        assert!(tls_subjects(&["plex.ok"], &[]).is_ok());
        assert!(matches!(
            tls_subjects(&["localhost"], &[]),
            Err(ConfigError::InvalidDomain(_))
        ));
        assert!(matches!(
            tls_subjects(&["*.oklabs.uk"], &[]),
            Err(ConfigError::InvalidDomain(_))
        ));
    }

    #[test]
    fn empty_hosts_still_emit_admin_and_gate_without_tls() {
        let config = build_caddy_config(&input()).unwrap();
        assert_eq!(config["admin"]["listen"], "127.0.0.1:2019");
        assert!(config["apps"]["http"]["servers"]["admin_gate"].is_object());
        assert!(config["apps"].get("tls").is_none());
    }

    #[test]
    fn generator_splits_http_and_https_and_builds_dns_policy() {
        let mut value = input();
        value.hosts = vec![host("git.oklabs.uk", true), host("plex.ok", false)];
        let config = build_caddy_config(&value).unwrap();
        assert_eq!(
            config["apps"]["http"]["servers"]["https"]["routes"][0]["match"][0]["host"][0],
            "git.oklabs.uk"
        );
        assert_eq!(
            config["apps"]["http"]["servers"]["http"]["routes"][0]["match"][0]["host"][0],
            "plex.ok"
        );
        assert_eq!(
            config["apps"]["tls"]["certificates"]["automate"],
            json!(["*.oklabs.uk"])
        );
        assert_eq!(
            config["apps"]["tls"]["automation"]["policies"][0]["issuers"][0]["challenges"]["dns"]
                ["propagation_timeout"],
            -1
        );
        assert!(config.to_string().contains("{env.CLOUDFLARE_API_TOKEN}"));
        assert!(!config.to_string().contains("prefer_wildcard"));
    }

    #[test]
    fn https_gate_matches_host_rewrites_host_and_uses_tls() {
        let mut value = input();
        value.admin_url = "https://caddy-admin.oklabs.uk:2019".into();
        value.lan_ip = "10.10.0.32".into();
        value.admin_gate_port = 2019;
        value.admin_allowed_ranges = vec![
            "10.10.0.22/32".into(),
            "10.10.0.32/32".into(),
            "127.0.0.1/32".into(),
        ];
        value.dns_token_placeholder = "{file./etc/caddy/cf_token}".into();
        let config = build_caddy_config(&value).unwrap();
        let gate = &config["apps"]["http"]["servers"]["admin_gate"];
        assert_eq!(gate["listen"], json!(["10.10.0.32:2019"]));
        assert_eq!(
            gate["routes"][0]["match"][0]["host"],
            json!(["caddy-admin.oklabs.uk"])
        );
        assert_eq!(
            gate["routes"][0]["handle"][1]["headers"]["request"]["set"]["Host"],
            json!(["127.0.0.1:2019"])
        );
        assert_eq!(gate["routes"][1]["handle"][0]["close"], true);
        assert_eq!(
            config["apps"]["tls"]["certificates"]["automate"],
            json!(["*.oklabs.uk"])
        );
        assert!(config.to_string().contains("{file./etc/caddy/cf_token}"));
    }

    #[test]
    fn origins_include_loopback_gate_and_hostname_authority() {
        let mut value = input();
        value.admin_url = "http://caddy.example.test:2999".into();
        value.admin_listen = "127.0.0.1:2119".into();
        let config = build_caddy_config(&value).unwrap();
        let origins = config["admin"]["origins"].as_array().unwrap();
        for expected in [
            "127.0.0.1:2119",
            "localhost:2119",
            "[::1]:2119",
            "127.0.0.1:2029",
            "caddy.example.test:2999",
        ] {
            assert!(origins.iter().any(|value| value == expected));
        }
    }

    #[test]
    fn validation_errors_cover_every_gate_field() {
        let mut value = input();
        value.lan_ip.clear();
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_lan_ip"))
        );

        let mut value = input();
        value.lan_ip = "nope".into();
        assert!(matches!(
            build_caddy_config(&value),
            Err(ConfigError::InvalidLanIp(_))
        ));

        let mut value = input();
        value.admin_user.clear();
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_admin_user"))
        );

        let mut value = input();
        value.admin_password_hash = None;
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_admin_password_hash"))
        );

        let mut value = input();
        value.admin_allowed_ranges.clear();
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_admin_allowed_ranges"))
        );

        let mut value = input();
        value.admin_allowed_ranges = vec!["not-a-cidr".into()];
        assert!(matches!(
            build_caddy_config(&value),
            Err(ConfigError::InvalidAllowedRange(_))
        ));

        let mut value = input();
        value.admin_gate_port = 0;
        assert!(matches!(
            build_caddy_config(&value),
            Err(ConfigError::InvalidGatePort(_))
        ));

        let mut value = input();
        value.admin_listen.clear();
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_admin_listen"))
        );

        let mut value = input();
        value.hosts = vec![host("git.oklabs.uk", true)];
        value.acme_email.clear();
        assert_eq!(
            build_caddy_config(&value),
            Err(ConfigError::Missing("caddy_acme_email"))
        );
    }

    #[test]
    fn generation_is_byte_deterministic() {
        let mut value = input();
        value.hosts = vec![host("git.oklabs.uk", true), host("plex.ok", false)];
        let first = build_caddy_config(&value).unwrap();
        let second = build_caddy_config(&value).unwrap();
        assert_eq!(first, second);
        assert_eq!(
            serde_json::to_vec(&first).unwrap(),
            serde_json::to_vec(&second).unwrap()
        );
    }
}
