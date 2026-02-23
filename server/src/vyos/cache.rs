//! In-memory TTL cache for VyOS API responses.
//!
//! Avoids hitting the VyOS HTTP API on every browser request when the
//! underlying data hasn't changed. Entries expire after [`DEFAULT_TTL`].
//! Write operations should call [`VyosCache::invalidate`] so the next read
//! fetches fresh data.

use dashmap::DashMap;
use serde_json::Value;
use std::time::{Duration, Instant};

/// Default time-to-live for cached VyOS responses.
const DEFAULT_TTL: Duration = Duration::from_secs(30);

/// A cache entry: the JSON value, the instant it was stored, and its TTL.
struct Entry {
    value: Value,
    inserted: Instant,
    ttl: Duration,
}

/// Thread-safe TTL cache backed by [`DashMap`].
pub struct VyosCache {
    map: DashMap<String, Entry>,
    ttl: Duration,
}

impl VyosCache {
    /// Create a new cache with the default TTL.
    pub fn new() -> Self {
        Self {
            map: DashMap::new(),
            ttl: DEFAULT_TTL,
        }
    }

    /// Look up a cached value. Returns `None` if missing or expired.
    pub fn get(&self, key: &str) -> Option<Value> {
        let entry = self.map.get(key)?;
        if entry.inserted.elapsed() < entry.ttl {
            Some(entry.value.clone())
        } else {
            drop(entry); // release read lock before removing
            self.map.remove(key);
            None
        }
    }

    /// Insert or update a cache entry with the default TTL.
    pub fn set(&self, key: String, value: Value) {
        self.map.insert(
            key,
            Entry {
                value,
                inserted: Instant::now(),
                ttl: self.ttl,
            },
        );
    }

    /// Insert or update a cache entry with a custom TTL.
    pub fn set_with_ttl(&self, key: String, value: Value, ttl: Duration) {
        self.map.insert(
            key,
            Entry {
                value,
                inserted: Instant::now(),
                ttl,
            },
        );
    }

    /// Remove all entries whose keys start with `prefix`.
    ///
    /// Called after VyOS write operations to ensure subsequent reads
    /// return fresh data.
    pub fn invalidate(&self, prefix: &str) {
        self.map.retain(|k, _| !k.starts_with(prefix));
    }

    /// Remove all entries.
    pub fn clear(&self) {
        self.map.clear();
    }
}

impl Default for VyosCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Build a cache key from the VyOS endpoint and path segments.
pub fn cache_key(endpoint: &str, path: &[&str]) -> String {
    let mut key = String::from(endpoint);
    for p in path {
        key.push(':');
        key.push_str(p);
    }
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_returns_none_when_empty() {
        let cache = VyosCache::new();
        assert!(cache.get("show:interfaces").is_none());
    }

    #[test]
    fn set_then_get_returns_value() {
        let cache = VyosCache::new();
        let val = serde_json::json!({"foo": "bar"});
        cache.set("show:interfaces".into(), val.clone());
        assert_eq!(cache.get("show:interfaces"), Some(val));
    }

    #[test]
    fn invalidate_removes_matching_prefix() {
        let cache = VyosCache::new();
        cache.set("retrieve:firewall".into(), Value::Null);
        cache.set("retrieve:interfaces".into(), Value::Null);
        cache.set("show:interfaces".into(), Value::Null);

        cache.invalidate("retrieve:");
        assert!(cache.get("retrieve:firewall").is_none());
        assert!(cache.get("retrieve:interfaces").is_none());
        // Different prefix — still present.
        assert!(cache.get("show:interfaces").is_some());
    }

    #[test]
    fn clear_removes_everything() {
        let cache = VyosCache::new();
        cache.set("a".into(), Value::Null);
        cache.set("b".into(), Value::Null);
        cache.clear();
        assert!(cache.get("a").is_none());
        assert!(cache.get("b").is_none());
    }

    #[test]
    fn cache_key_format() {
        assert_eq!(cache_key("show", &["ip", "route"]), "show:ip:route");
        assert_eq!(cache_key("retrieve", &["firewall"]), "retrieve:firewall");
    }
}
