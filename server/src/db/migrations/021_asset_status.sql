-- Migration 021: Add status column to assets for inventory management.
-- Valid statuses: active, inactive, maintenance, retired, disposed.

ALTER TABLE assets ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_location ON assets(location);
CREATE INDEX idx_assets_owner ON assets(owner);
