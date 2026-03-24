-- Alert rules enhancements: position ordering, hit counters, time-based schedules, connection limits.
ALTER TABLE alert_rules ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alert_rules ADD COLUMN hit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alert_rules ADD COLUMN schedule_days TEXT;
ALTER TABLE alert_rules ADD COLUMN schedule_start_time TEXT;
ALTER TABLE alert_rules ADD COLUMN schedule_end_time TEXT;
ALTER TABLE alert_rules ADD COLUMN connection_limit INTEGER;
