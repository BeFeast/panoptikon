-- Cache of the leaf certificate Caddy currently serves per TLS-enabled proxy host.
-- Populated by the TLS probe task (server/src/caddy_probe.rs), never written by the UI.
-- NOTE: this file is split on the statement terminator by run_migrations.
CREATE TABLE IF NOT EXISTS caddy_certificates (
    domain              TEXT PRIMARY KEY,
    proxy_host_id       TEXT,
    issuer              TEXT,
    subject             TEXT,
    sans                TEXT,
    not_before          TEXT,
    not_after           TEXT,
    serial              TEXT,
    fingerprint_sha256  TEXT,
    chain_valid         INTEGER,
    error               TEXT,
    probed_at           TEXT NOT NULL
);
