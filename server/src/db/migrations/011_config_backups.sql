-- Config backups: store VyOS running config snapshots for backup & rollback.
CREATE TABLE IF NOT EXISTS vyos_config_backups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    label       TEXT,
    config_text TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    created_by  TEXT NOT NULL DEFAULT 'user'
);
