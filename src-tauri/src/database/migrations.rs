use super::{db_error, Database};
use crate::errors::{AppError, AppResult};

const VERSION_1: &str = r#"
CREATE TABLE IF NOT EXISTS browser_configs (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    executable_path TEXT NOT NULL,
    version         TEXT,
    is_default      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_configs_path
    ON browser_configs(executable_path COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_configs_default
    ON browser_configs(is_default) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS environments (
    id                  TEXT PRIMARY KEY NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    user_data_dir       TEXT NOT NULL,
    source_type         TEXT NOT NULL,
    browser_config_id   TEXT NOT NULL REFERENCES browser_configs(id) ON DELETE RESTRICT,
    color               TEXT,
    icon                TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    last_launched_at    TEXT,
    last_status         TEXT NOT NULL DEFAULT 'unknown',
    last_pid            INTEGER,
    last_pid_started_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_user_data_dir
    ON environments(user_data_dir COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_environments_browser
    ON environments(browser_config_id);

CREATE TABLE IF NOT EXISTS backups (
    id               TEXT PRIMARY KEY NOT NULL,
    environment_id   TEXT NOT NULL,
    environment_name TEXT NOT NULL,
    path             TEXT NOT NULL,
    size_bytes       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    note             TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_backups_path
    ON backups(path COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_backups_environment
    ON backups(environment_id);
"#;

const VERSION_2: &str = r#"
-- Default-profile flag: the environment that the plain Chrome shortcut
-- (no --user-data-dir) resolves to via the system junction takeover.
ALTER TABLE environments ADD COLUMN is_default_profile INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_environments_default_profile
    ON environments(is_default_profile) WHERE is_default_profile = 1;
"#;

const MIGRATIONS: &[&str] = &[VERSION_1, VERSION_2];

pub fn run(database: &mut Database) -> AppResult<()> {
    let current = database
        .user_version()
        .map_err(|error| db_error("无法读取数据库版本", error))?;

    let target = MIGRATIONS.len() as i64;
    if current > target {
        return Err(AppError::with_detail(
            "DATABASE_ERROR",
            "当前数据库由更高版本的 BrowserHub 创建，无法安全打开。",
            format!("database version {current}, supported {target}"),
        ));
    }

    for (index, script) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = (index + 1) as i64;
        database.with_transaction(|transaction| {
            transaction.execute_script(script)?;
            transaction
                .set_user_version(version)
                .map_err(|error| db_error("无法更新数据库版本", error))?;
            Ok(())
        })?;
        log::info!("database migrated to version {version}");
    }

    Ok(())
}
