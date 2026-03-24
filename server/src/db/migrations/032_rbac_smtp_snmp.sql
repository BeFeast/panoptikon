-- Migration 032: RBAC multi-user, SMTP email notifications, SNMP management settings.

-- Users table for RBAC multi-user access.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'read-only', 'operator')),
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add user_id to sessions (nullable for backward compat with existing sessions).
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- Add notify_email to alert_rules.
ALTER TABLE alert_rules ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 0;
