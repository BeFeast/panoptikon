-- Migration 033: Add notify_email column to alert_rules and SMTP/SNMP settings keys.
-- SMTP and SNMP configuration is stored in the existing settings key-value table.

ALTER TABLE alert_rules ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 0;
