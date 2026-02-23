-- Alert rules: configurable rules for generating alerts.
CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('device_offline', 'bandwidth_threshold', 'new_device')),
    enabled INTEGER NOT NULL DEFAULT 1,
    threshold_value INTEGER,
    notify_telegram INTEGER NOT NULL DEFAULT 1,
    notify_in_app INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
