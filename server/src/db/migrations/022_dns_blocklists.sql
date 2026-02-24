-- Migration 022: DNS blocklist manager tables.

-- Blocklist sources (URLs to download domain lists from).
CREATE TABLE IF NOT EXISTS dns_blocklists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    format TEXT NOT NULL DEFAULT 'hosts',
    domain_count INTEGER NOT NULL DEFAULT 0,
    last_downloaded_at TEXT,
    last_error TEXT,
    refresh_interval_hours INTEGER NOT NULL DEFAULT 24,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-domain whitelist/blacklist overrides.
CREATE TABLE IF NOT EXISTS dns_domain_overrides (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL CHECK (action IN ('whitelist', 'blacklist')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cached blocked domains from all enabled blocklists.
CREATE TABLE IF NOT EXISTS dns_blocked_domains (
    domain TEXT NOT NULL,
    blocklist_id TEXT NOT NULL REFERENCES dns_blocklists(id) ON DELETE CASCADE,
    PRIMARY KEY (domain, blocklist_id)
);

CREATE INDEX IF NOT EXISTS idx_dns_blocked_domains_list ON dns_blocked_domains(blocklist_id);
