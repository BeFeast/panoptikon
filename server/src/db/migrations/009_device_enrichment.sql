-- Migration 009: device enrichment — OS fingerprinting, device type, model identification
-- Adds columns for Fing-style device identification data.

ALTER TABLE devices ADD COLUMN os_family TEXT;
ALTER TABLE devices ADD COLUMN os_version TEXT;
ALTER TABLE devices ADD COLUMN device_type TEXT;
ALTER TABLE devices ADD COLUMN device_model TEXT;
ALTER TABLE devices ADD COLUMN device_brand TEXT;
ALTER TABLE devices ADD COLUMN enrichment_source TEXT;
ALTER TABLE devices ADD COLUMN enrichment_corrected INTEGER NOT NULL DEFAULT 0;
