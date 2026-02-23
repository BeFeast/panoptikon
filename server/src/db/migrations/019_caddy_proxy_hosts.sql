-- Migration 019: Caddy proxy hosts — source-of-truth table for reverse proxy definitions.
-- Panoptikon stores host definitions here and syncs to Caddy via its JSON Admin API.

CREATE TABLE IF NOT EXISTS caddy_proxy_hosts (
    id         TEXT PRIMARY KEY,
    domain     TEXT NOT NULL,
    upstream   TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    ssl_mode   TEXT NOT NULL DEFAULT 'disabled',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
