-- DNS blocklist management tables.

CREATE TABLE IF NOT EXISTS dns_blocklists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    enabled INTEGER NOT NULL DEFAULT 1,
    auto_refresh_hours INTEGER,
    domain_count INTEGER NOT NULL DEFAULT 0,
    last_updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dns_blocklist_domains (
    domain TEXT NOT NULL,
    blocklist_id TEXT NOT NULL REFERENCES dns_blocklists(id) ON DELETE CASCADE,
    PRIMARY KEY (domain, blocklist_id)
);

CREATE INDEX IF NOT EXISTS idx_blocklist_domains_list ON dns_blocklist_domains(blocklist_id);

CREATE TABLE IF NOT EXISTS dns_domain_overrides (
    domain TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK(action IN ('whitelist', 'blacklist')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
