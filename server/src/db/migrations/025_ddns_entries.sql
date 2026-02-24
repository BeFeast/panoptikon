-- Dynamic DNS client entries for managing DDNS configurations.
CREATE TABLE IF NOT EXISTS ddns_entries (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    hostname        TEXT NOT NULL,
    username        TEXT,
    password        TEXT,
    api_token       TEXT,
    zone            TEXT,
    interface_name  TEXT,
    ip_source       TEXT NOT NULL DEFAULT 'wan',
    protocol        TEXT NOT NULL DEFAULT 'ipv4',
    enabled         INTEGER NOT NULL DEFAULT 1,
    router_type     TEXT NOT NULL DEFAULT 'vyos',
    last_status     TEXT NOT NULL DEFAULT 'unknown',
    last_ip         TEXT,
    last_updated_at TEXT,
    last_error      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ddns_entries_provider ON ddns_entries(provider);
CREATE INDEX IF NOT EXISTS idx_ddns_entries_enabled ON ddns_entries(enabled);
