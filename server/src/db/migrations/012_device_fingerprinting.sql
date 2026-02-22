-- Enhanced device fingerprinting: sysinfo from agents + randomized MAC flag.

-- Device system info reported by agents (hardware inventory).
CREATE TABLE IF NOT EXISTS device_sysinfo (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    reported_at     TEXT NOT NULL DEFAULT (datetime('now')),
    -- OS
    os_name         TEXT,
    os_version      TEXT,
    os_build        TEXT,
    -- Hardware
    hardware_model  TEXT,
    cpu_name        TEXT,
    cpu_cores       INTEGER,
    cpu_speed       TEXT,
    ram_total       TEXT,
    ram_speed       TEXT,
    ram_type        TEXT,
    gpu_name        TEXT,
    gpu_vram        TEXT,
    -- Storage
    disk_name       TEXT,
    disk_size       TEXT,
    -- Identity
    serial_number   TEXT,
    hostname        TEXT,
    uptime_seconds  INTEGER,
    last_boot       TEXT,
    UNIQUE(device_id)
);
CREATE INDEX IF NOT EXISTS idx_device_sysinfo_device ON device_sysinfo(device_id);

-- Flag for randomized (locally administered) MAC addresses.
ALTER TABLE devices ADD COLUMN is_randomized_mac INTEGER NOT NULL DEFAULT 0;
