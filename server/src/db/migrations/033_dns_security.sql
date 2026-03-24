-- DNS-over-TLS (DoT) upstream servers
CREATE TABLE IF NOT EXISTS dns_dot_upstreams (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    address     TEXT NOT NULL,
    port        INTEGER NOT NULL DEFAULT 853,
    tls_hostname TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dns_dot_upstreams_enabled ON dns_dot_upstreams(enabled);
