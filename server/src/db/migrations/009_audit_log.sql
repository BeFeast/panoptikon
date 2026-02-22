-- Migration 009: Audit log for VyOS write operations
-- Stores all configuration changes made via Panoptikon for accountability and debugging.

CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    action        TEXT NOT NULL,
    description   TEXT NOT NULL,
    vyos_commands TEXT NOT NULL,
    success       INTEGER NOT NULL DEFAULT 1,
    error_msg     TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
