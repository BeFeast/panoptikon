-- Speedtest history: store each speedtest result for trend tracking.
CREATE TABLE IF NOT EXISTS speedtest_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tested_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    download_mbps REAL  NOT NULL,
    upload_mbps   REAL  NOT NULL,
    ping_ms       REAL  NOT NULL,
    jitter_ms     REAL  NOT NULL,
    packet_loss   REAL  NOT NULL DEFAULT 0,
    isp           TEXT  NOT NULL DEFAULT '',
    server_name   TEXT  NOT NULL DEFAULT '',
    result_url    TEXT,
    error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_speedtest_history_tested_at
    ON speedtest_history(tested_at DESC);
