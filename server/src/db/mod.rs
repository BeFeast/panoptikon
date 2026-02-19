use anyhow::Result;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::str::FromStr;
use tracing::info;

/// The initial migration SQL, embedded at compile time.
const INIT_MIGRATION: &str = include_str!("migrations/001_init.sql");

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
async fn run_migrations(pool: &SqlitePool) -> Result<()> {
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
            let stmt = statement.trim();
            if stmt.is_empty() || stmt.starts_with("--") {
                continue;
            }
            sqlx::query(stmt).execute(pool).await?;
        }

        sqlx::query("INSERT INTO _migrations (version) VALUES (1)")
            .execute(pool)
            .await?;

        info!("Applied migration 001_init.sql");
    }

    Ok(())
}
