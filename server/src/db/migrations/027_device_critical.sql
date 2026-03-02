-- Migration 027: Add is_critical flag for infrastructure health tracking.
-- NULL = auto-detect (use device_type/vendor heuristics)
-- 1 = manually pinned as critical
-- 0 = manually excluded from health
ALTER TABLE devices ADD COLUMN is_critical INTEGER DEFAULT NULL;
