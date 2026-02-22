use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tracing::info;

/// The initial migration SQL, embedded at compile time.
const INIT_MIGRATION: &str = include_str!("migrations/001_init.sql");

/// Migration 002: persistent sessions table.
const SESSIONS_MIGRATION: &str = include_str!("migrations/002_sessions.sql");

/// Migration 003: clean up leftover test/dev agents.
const CLEANUP_TEST_AGENTS_MIGRATION: &str = include_str!("migrations/003_cleanup_test_agents.sql");

/// Migration 004: device events table for online/offline history tracking.
const DEVICE_EVENTS_MIGRATION: &str = include_str!("migrations/004_device_events.sql");

/// Migration 005: port_scans table for caching nmap scan results.
const PORT_SCANS_MIGRATION: &str = include_str!("migrations/005_port_scans.sql");

/// Migration 006: add mdns_services column to devices table.
const MDNS_SERVICES_MIGRATION: &str = include_str!("migrations/006_mdns_services.sql");

/// Migration 007: alert management — acknowledge, mute, severity levels.
const ALERT_MANAGEMENT_MIGRATION: &str = include_str!("migrations/007_alert_management.sql");

/// Migration 008: topology positions — persist node positions after drag.
const TOPOLOGY_POSITIONS_MIGRATION: &str = include_str!("migrations/008_topology_positions.sql");

/// Migration 009: audit log for VyOS write operations.
const AUDIT_LOG_MIGRATION: &str = include_str!("migrations/009_audit_log.sql");

/// Initialize the SQLite database pool and run migrations.
pub async fn init(database_url: &str) -> Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations manually (avoids compile-time DATABASE_URL requirement).
    run_migrations(&pool).await?;
    info!("Database migrations applied");

    Ok(pool)
}

/// Apply migrations using a simple version-tracking approach.
pub(crate) async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    // Create migrations tracking table if it doesn't exist.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (\
         version INTEGER PRIMARY KEY, \
         applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
    )
    .execute(pool)
    .await?;

    // Check if migration 1 has been applied.
    let applied: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 1")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied {
        // Split on semicolons and execute each statement.
        for statement in INIT_MIGRATION.split(';') {
            // Strip leading comment lines to get to the actual SQL.
            let code = statement
                .lines()
                .skip_while(|l| l.trim().starts_with("--") || l.trim().is_empty())
                .collect::<Vec<_>>()
                .join("\n");
            let stmt = code.trim();
            if stmt.is_empty() {
                continue;
            }
            sqlx::query(stmt).execute(pool).await?;
        }

        sqlx::query("INSERT INTO _migrations (version) VALUES (1)")
            .execute(pool)
            .await?;

        info!("Applied migration 001_init.sql");
    }

    // Migration 002: persistent sessions table.
    let applied_2: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 2")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_2 {
        // Use raw_sql to execute the migration as a multi-statement script,
        // avoiding fragile semicolon-splitting that breaks on embedded semicolons.
        sqlx::raw_sql(SESSIONS_MIGRATION).execute(pool).await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (2)")
            .execute(pool)
            .await?;

        info!("Applied migration 002_sessions.sql");
    }

    // Migration 003: clean up leftover test/dev agents.
    let applied_3: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 3")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_3 {
        sqlx::raw_sql(CLEANUP_TEST_AGENTS_MIGRATION)
            .execute(pool)
            .await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (3)")
            .execute(pool)
            .await?;

        info!("Applied migration 003_cleanup_test_agents.sql");
    }

    // Migration 004: device events table.
    let applied_4: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 4")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_4 {
        sqlx::raw_sql(DEVICE_EVENTS_MIGRATION).execute(pool).await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (4)")
            .execute(pool)
            .await?;

        info!("Applied migration 004_device_events.sql");
    }

    // Migration 005: port_scans table.
    let applied_5: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 5")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_5 {
        sqlx::raw_sql(PORT_SCANS_MIGRATION).execute(pool).await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (5)")
            .execute(pool)
            .await?;

        info!("Applied migration 005_port_scans.sql");
    }

    // Migration 006: mdns_services column.
    let applied_6: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 6")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_6 {
        sqlx::raw_sql(MDNS_SERVICES_MIGRATION).execute(pool).await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (6)")
            .execute(pool)
            .await?;

        info!("Applied migration 006_mdns_services.sql");
    }

    // Migration 007: alert management — acknowledge, mute, severity levels.
    let applied_7: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 7")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_7 {
        sqlx::raw_sql(ALERT_MANAGEMENT_MIGRATION)
            .execute(pool)
            .await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (7)")
            .execute(pool)
            .await?;

        info!("Applied migration 007_alert_management.sql");
    }

    // Migration 008: topology positions table.
    let applied_8: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 8")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_8 {
        sqlx::raw_sql(TOPOLOGY_POSITIONS_MIGRATION)
            .execute(pool)
            .await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (8)")
            .execute(pool)
            .await?;

        info!("Applied migration 008_topology_positions.sql");
    }

    // Migration 009: audit log table.
    let applied_9: bool = sqlx::query("SELECT 1 FROM _migrations WHERE version = 9")
        .fetch_optional(pool)
        .await?
        .is_some();

    if !applied_9 {
        sqlx::raw_sql(AUDIT_LOG_MIGRATION).execute(pool).await?;

        sqlx::query("INSERT INTO _migrations (version) VALUES (9)")
            .execute(pool)
            .await?;

        info!("Applied migration 009_audit_log.sql");
    }

    // Purge expired sessions on startup.
    let deleted = sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
        .execute(pool)
        .await?
        .rows_affected();
    if deleted > 0 {
        info!(deleted, "Purged expired sessions on startup");
    }

    // Purge device events older than 30 days on startup.
    let events_deleted =
        sqlx::query("DELETE FROM device_events WHERE occurred_at < datetime('now', '-30 days')")
            .execute(pool)
            .await?
            .rows_affected();
    if events_deleted > 0 {
        info!(events_deleted, "Purged old device events on startup");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_migrations_apply_cleanly() {
        let pool = init(":memory:").await.expect("DB init failed");

        // Verify all expected tables exist after migration.
        let expected_tables = [
            "settings",
            "devices",
            "device_ips",
            "device_state_log",
            "agents",
            "agent_reports",
            "traffic_samples",
            "alerts",
            "sessions",
            "device_events",
            "topology_positions",
            "audit_log",
        ];

        for table in &expected_tables {
            let count: i64 = sqlx::query_scalar(&format!(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='{table}'"
            ))
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|e| panic!("Query failed for table '{table}': {e}"));

            assert_eq!(count, 1, "Table '{table}' should exist after migration");
        }
    }

    #[tokio::test]
    async fn test_migrations_idempotent() {
        let pool = init(":memory:").await.expect("First init failed");
        // Running migrations again should not fail (idempotent).
        run_migrations(&pool)
            .await
            .expect("Second migration run should succeed");
    }

    #[tokio::test]
    async fn test_migration_tracking_table_exists() {
        let pool = init(":memory:").await.expect("DB init failed");

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_migrations'",
        )
        .fetch_one(&pool)
        .await
        .expect("Query failed");

        assert_eq!(count, 1, "_migrations tracking table should exist");
    }

    #[tokio::test]
    async fn test_migration_version_recorded() {
        let pool = init(":memory:").await.expect("DB init failed");

        let version: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _migrations WHERE version = 1")
            .fetch_one(&pool)
            .await
            .expect("Query failed");

        assert_eq!(version, 1, "Migration version 1 should be recorded");
    }

    #[tokio::test]
    async fn test_settings_get_default_empty() {
        let pool = init(":memory:").await.expect("DB init failed");

        let row: Option<(String,)> =
            sqlx::query_as(r#"SELECT value FROM settings WHERE key = 'webhook_url'"#)
                .fetch_optional(&pool)
                .await
                .expect("Query failed");

        assert!(row.is_none(), "Fresh DB should have no webhook_url setting");
    }

    #[tokio::test]
    async fn test_settings_set_and_get() {
        let pool = init(":memory:").await.expect("DB init failed");

        let url = "https://example.com/webhook";

        sqlx::query(
            r#"INSERT INTO settings (key, value) VALUES ('webhook_url', ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
        )
        .bind(url)
        .execute(&pool)
        .await
        .expect("Insert failed");

        let row: Option<(String,)> =
            sqlx::query_as(r#"SELECT value FROM settings WHERE key = 'webhook_url'"#)
                .fetch_optional(&pool)
                .await
                .expect("Query failed");

        assert_eq!(
            row.map(|(v,)| v),
            Some(url.to_string()),
            "webhook_url should be readable after set"
        );
    }
}
