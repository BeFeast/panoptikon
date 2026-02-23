-- Migration 018: Add unique indexes on traffic_hourly and traffic_daily
-- for the background rollup task (upsert support) and query performance.

CREATE UNIQUE INDEX IF NOT EXISTS idx_traffic_hourly_device_hour
    ON traffic_hourly(device_id, hour);

CREATE UNIQUE INDEX IF NOT EXISTS idx_traffic_daily_device_day
    ON traffic_daily(device_id, day);
