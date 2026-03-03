-- Migration 028: Rename VyOS artifacts — table name.
-- VyOS has been fully removed. Rename the leftover table.
ALTER TABLE vyos_config_backups RENAME TO config_backups;
