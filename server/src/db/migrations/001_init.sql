-- Panoptikon initial schema
-- Based on PRD Section 9: Data Model

-- ============================================
-- Core tables
-- ============================================

CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY,  -- UUID
    mac             TEXT NOT NULL UNIQUE,
    name            TEXT,              -- User-assigned friendly name
    hostname        TEXT,              -- Discovered via DHCP/mDNS
    vendor          TEXT,              -- OUI lookup result
    icon            TEXT DEFAULT 'device',
    notes           TEXT,
    is_known        INTEGER DEFAULT 0,
    is_favorite     INTEGER DEFAULT 0,
    first_seen_at   TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL,
    is_online       INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac);
CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(is_online);

CREATE TABLE IF NOT EXISTS device_ips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip          TEXT NOT NULL,
    subnet      TEXT,
    seen_at     TEXT NOT NULL,
    is_current  INTEGER DEFAULT 1,
    UNIQUE(device_id, ip)
);

CREATE INDEX IF NOT EXISTS idx_device_ips_ip ON device_ips(ip);

CREATE TABLE IF NOT EXISTS device_state_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    state       TEXT NOT NULL,     -- 'online' or 'offline'
    changed_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_state_log_device ON device_state_log(device_id, changed_at);

-- ============================================
-- Agent tables
-- ============================================

CREATE TABLE IF NOT EXISTS agents (
    id              TEXT PRIMARY KEY,  -- UUID
    device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
    api_key_hash    TEXT NOT NULL,     -- bcrypt hash
    name            TEXT,
    platform        TEXT,
    version         TEXT,
    is_online       INTEGER DEFAULT 0,
    last_report_at  TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    reported_at TEXT NOT NULL,
    hostname    TEXT,
    os_name     TEXT,
    os_version  TEXT,
    kernel      TEXT,
    arch        TEXT,
    uptime_secs INTEGER,
    cpu_count   INTEGER,
    cpu_percent REAL,
    load_1m     REAL,
    load_5m     REAL,
    load_15m    REAL,
    mem_total   INTEGER,
    mem_used    INTEGER,
    swap_total  INTEGER,
    swap_used   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_agent ON agent_reports(agent_id, reported_at);

CREATE TABLE IF NOT EXISTS agent_report_disks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_report_id INTEGER NOT NULL REFERENCES agent_reports(id) ON DELETE CASCADE,
    mount           TEXT NOT NULL,
    filesystem      TEXT,
    total_bytes     INTEGER,
    used_bytes      INTEGER
);

CREATE TABLE IF NOT EXISTS agent_report_network (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_report_id INTEGER NOT NULL REFERENCES agent_reports(id) ON DELETE CASCADE,
    interface_name  TEXT NOT NULL,
    mac             TEXT,
    addresses       TEXT,  -- JSON array of CIDR strings
    tx_bytes        INTEGER,
    rx_bytes        INTEGER,
    tx_bytes_delta  INTEGER,
    rx_bytes_delta  INTEGER,
    speed_mbps      INTEGER,
    state           TEXT
);

-- ============================================
-- Traffic & metrics (aggregated)
-- ============================================

CREATE TABLE IF NOT EXISTS traffic_samples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    sampled_at  TEXT NOT NULL,
    tx_bps      INTEGER,
    rx_bps      INTEGER,
    source      TEXT
);

CREATE INDEX IF NOT EXISTS idx_traffic_samples_device ON traffic_samples(device_id, sampled_at);

CREATE TABLE IF NOT EXISTS traffic_hourly (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    hour        TEXT NOT NULL,
    avg_tx_bps  INTEGER,
    avg_rx_bps  INTEGER,
    max_tx_bps  INTEGER,
    max_rx_bps  INTEGER,
    samples     INTEGER
);

CREATE TABLE IF NOT EXISTS traffic_daily (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    avg_tx_bps  INTEGER,
    avg_rx_bps  INTEGER,
    max_tx_bps  INTEGER,
    max_rx_bps  INTEGER,
    total_tx_bytes INTEGER,
    total_rx_bytes INTEGER,
    samples     INTEGER
);

-- ============================================
-- Alerts
-- ============================================

CREATE TABLE IF NOT EXISTS alerts (
    id          TEXT PRIMARY KEY,  -- UUID
    type        TEXT NOT NULL,
    device_id   TEXT REFERENCES devices(id) ON DELETE CASCADE,
    agent_id    TEXT REFERENCES agents(id) ON DELETE CASCADE,
    message     TEXT NOT NULL,
    details     TEXT,              -- JSON blob
    is_read     INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, created_at);
