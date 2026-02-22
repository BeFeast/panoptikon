-- Migration 016: manual asset inventory fields.
-- Allows fully manual device records for non-discoverable devices
-- (managed switches, printers, IoT, UPS, etc.)

ALTER TABLE devices ADD COLUMN is_manual INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN location TEXT;
ALTER TABLE devices ADD COLUMN owner TEXT;
ALTER TABLE devices ADD COLUMN tags TEXT;
ALTER TABLE devices ADD COLUMN cpu_manual TEXT;
ALTER TABLE devices ADD COLUMN ram_manual TEXT;
ALTER TABLE devices ADD COLUMN disk_manual TEXT;
ALTER TABLE devices ADD COLUMN purchase_date TEXT;
ALTER TABLE devices ADD COLUMN warranty_expiry TEXT;
ALTER TABLE devices ADD COLUMN serial_number TEXT;
