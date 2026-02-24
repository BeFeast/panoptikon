-- Migration 023: DNS query log table for per-device query history.
-- Stores DNS queries passing through Unbound with 7-day TTL.

CREATE TABLE IF NOT EXISTS dns_query_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT,
    client_ip   TEXT NOT NULL,
    domain      TEXT NOT NULL,
    query_type  TEXT NOT NULL DEFAULT 'A',
    response_code TEXT NOT NULL DEFAULT 'NOERROR',
    blocked     INTEGER NOT NULL DEFAULT 0,
    response_time_ms INTEGER,
    upstream    TEXT,
    queried_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dns_query_log_queried_at ON dns_query_log(queried_at);
CREATE INDEX IF NOT EXISTS idx_dns_query_log_device_id ON dns_query_log(device_id);
CREATE INDEX IF NOT EXISTS idx_dns_query_log_domain ON dns_query_log(domain);
CREATE INDEX IF NOT EXISTS idx_dns_query_log_blocked ON dns_query_log(blocked);
