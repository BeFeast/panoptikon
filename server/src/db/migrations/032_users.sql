-- Migration 032: Multi-user RBAC — users table with roles.
-- Migrates from single admin_password_hash in settings to per-user accounts.

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    email TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operator', 'readonly')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link sessions to users for RBAC
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id);

-- Migrate existing single admin into the users table.
-- Only runs if an admin_password_hash exists and no users have been created yet.
INSERT INTO users (id, username, display_name, password_hash, role)
SELECT
    lower(hex(randomblob(16))),
    'admin',
    'Administrator',
    value,
    'admin'
FROM settings
WHERE key = 'admin_password_hash'
  AND NOT EXISTS (SELECT 1 FROM users);
