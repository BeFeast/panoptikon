-- Migration 014: manual device editing — custom override fields.
--
-- Adds custom_* columns so users can manually label devices.
-- Custom fields take priority over auto-detected values in the UI.
-- Keyed by device_id so overrides survive IP/MAC changes.

ALTER TABLE devices ADD COLUMN custom_name TEXT;
ALTER TABLE devices ADD COLUMN custom_type TEXT;
ALTER TABLE devices ADD COLUMN custom_os TEXT;
ALTER TABLE devices ADD COLUMN custom_vendor TEXT;
ALTER TABLE devices ADD COLUMN custom_model TEXT;
ALTER TABLE devices ADD COLUMN icon_override TEXT;
