-- Migration 019: Caddy reverse proxy hosts — source of truth for proxy config.
CREATE TABLE IF NOT EXISTS caddy_proxy_hosts (
    id          TEXT PRIMARY KEY,
    domain      TEXT NOT NULL,
    forward_host TEXT NOT NULL,
    forward_port INTEGER NOT NULL DEFAULT 80,
    forward_scheme TEXT NOT NULL DEFAULT 'http',
    enabled     INTEGER NOT NULL DEFAULT 1,
    ssl_enabled INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
