-- Migration 003: Clean up leftover test/dev agents.
-- These agents were created during development and e2e testing.
-- Real agents (e.g. mac-mini) do not match these patterns.
DELETE FROM agent_reports WHERE agent_id IN (
    SELECT id FROM agents WHERE name LIKE 'e2e-%' OR name IN ('fixtest', 'sdf', 'dimtest')
);
DELETE FROM agents WHERE name LIKE 'e2e-%' OR name IN ('fixtest', 'sdf', 'dimtest');
