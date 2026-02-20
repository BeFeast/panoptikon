-- Migration 007: Alert management — acknowledge, mute, severity levels
-- Add acknowledged_at, acknowledged_by, severity to alerts
-- Add muted_until to devices

ALTER TABLE alerts ADD COLUMN acknowledged_at TEXT;
ALTER TABLE alerts ADD COLUMN acknowledged_by TEXT;
ALTER TABLE alerts ADD COLUMN severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO','WARNING','CRITICAL'));

ALTER TABLE devices ADD COLUMN muted_until TEXT;
