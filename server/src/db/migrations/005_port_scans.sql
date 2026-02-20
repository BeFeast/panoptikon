-- Migration 005: port_scans table for caching nmap scan results per device.
CREATE TABLE IF NOT EXISTS port_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
    result_json TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_port_scans_device_id ON port_scans(device_id);
