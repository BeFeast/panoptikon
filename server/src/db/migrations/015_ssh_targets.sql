-- SSH agentless monitoring: targets and reports tables.

CREATE TABLE IF NOT EXISTS ssh_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'password',  -- 'password' | 'key'
  password TEXT,
  private_key TEXT,
  poll_interval_secs INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ssh_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL REFERENCES ssh_targets(id) ON DELETE CASCADE,
  hostname TEXT,
  os_name TEXT,
  os_version TEXT,
  cpu_percent REAL,
  mem_total INTEGER,
  mem_used INTEGER,
  disk_total INTEGER,
  disk_used INTEGER,
  uptime_seconds INTEGER,
  reported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ssh_reports_target ON ssh_reports(target_id, reported_at);
