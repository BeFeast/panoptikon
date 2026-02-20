use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tracing::info;

/// The initial migration SQL, embedded at compile time.
const INIT_MIGRATION: &str = include_str!("migrations/001_init.sql");

/// Migration 002: persistent sessions table.
const SESSIONS_MIGRATION: &str = include_str!("migrations/002_sessions.sql");

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
        for statement in SESSIONS_MIGRATION.split(';') {
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

        sqlx::query("INSERT INTO _migrations (version) VALUES (2)")
            .execute(pool)
            .await?;

        info!("Applied migration 002_sessions.sql");
    }

    // Purge expired sessions on startup.
    let deleted = sqlx::query("DELETE FROM sessions WHERE expires_at < datetime('now')")
        .execute(pool)
        .await?
        .rows_affected();
    if deleted > 0 {
        info!(deleted, "Purged expired sessions on startup");
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
}
