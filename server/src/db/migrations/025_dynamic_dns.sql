-- Migration 025: Dynamic DNS client management.
-- Stores DDNS entry metadata and last-known status locally.

CREATE TABLE IF NOT EXISTS dynamic_dns (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    provider         TEXT NOT NULL,
    hostname         TEXT NOT NULL,
    username         TEXT NOT NULL DEFAULT '',
    password         TEXT NOT NULL DEFAULT '',
    interface        TEXT NOT NULL DEFAULT '',
    ip_source        TEXT NOT NULL DEFAULT 'interface',
    enabled          INTEGER NOT NULL DEFAULT 1,
    router_type      TEXT NOT NULL DEFAULT 'vyos',
    last_ip          TEXT,
    last_status      TEXT,
    last_update_at   TEXT,
    last_error       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
