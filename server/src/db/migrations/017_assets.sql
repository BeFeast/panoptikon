-- Migration 017: IT asset inventory table.
-- Standalone asset registry that can optionally link to devices, agents, or SSH targets.

CREATE TABLE assets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'unknown',
  location TEXT,
  owner TEXT,
  tags TEXT,
  notes TEXT,
  purchase_date TEXT,
  serial_number TEXT,
  device_id TEXT,
  agent_id TEXT,
  ssh_target_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_device ON assets(device_id);
CREATE INDEX idx_assets_agent ON assets(agent_id);
CREATE INDEX idx_assets_ssh_target ON assets(ssh_target_id);
