-- Migration 033: SMTP email notifications + SNMP configuration support.

-- Add notify_email column to alert_rules for email notification channel.
ALTER TABLE alert_rules ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 0;

-- SNMP configuration table for managed routers.
CREATE TABLE IF NOT EXISTS snmp_configs (
    id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 161,
    community TEXT NOT NULL DEFAULT 'public',
    version TEXT NOT NULL DEFAULT 'v2c' CHECK (version IN ('v1', 'v2c', 'v3')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
