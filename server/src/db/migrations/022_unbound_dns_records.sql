-- Unbound local DNS A records managed by Panoptikon.
-- Synced to /etc/unbound/unbound.conf.d/panoptikon-local.conf via unbound-control reload.
CREATE TABLE IF NOT EXISTS unbound_dns_records (
    id              TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL,
    ip_address      TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
