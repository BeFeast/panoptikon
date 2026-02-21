-- Migration 008: Topology positions — persist node positions after drag
-- Stores per-node (device/router) positions for the topology map.

CREATE TABLE IF NOT EXISTS topology_positions (
    node_id TEXT PRIMARY KEY,
    x       REAL NOT NULL,
    y       REAL NOT NULL,
    pinned  INTEGER NOT NULL DEFAULT 1
);
