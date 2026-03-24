-- Migration 032: Users table for multi-user RBAC support.
-- Roles: admin (full access), operator (read + write), readonly (read only).

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'readonly'
                  CHECK (role IN ('admin', 'operator', 'readonly')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Link sessions to users (optional — NULL means legacy single-admin session).
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
