use super::{
    db_error, duplicate_error, row_i64, row_i64_optional, row_optional_text, row_text, row_u32,
    Database, SqlValue,
};
use crate::errors::{AppError, AppResult};
use crate::models::{
    Environment, EnvironmentRecord, EnvironmentStatus, SourceType,
};

const COLUMNS: &str = "id, name, description, user_data_dir, source_type, browser_config_id, \
     color, icon, created_at, updated_at, last_launched_at, last_status, last_pid, \
     last_pid_started_at, is_default_profile";

fn map_row(row: &[SqlValue]) -> EnvironmentRecord {
    EnvironmentRecord {
        environment: Environment {
            id: row_text(row, 0),
            name: row_text(row, 1),
            description: row_optional_text(row, 2),
            user_data_dir: row_text(row, 3),
            source_type: SourceType::from_db(&row_text(row, 4)),
            browser_config_id: row_text(row, 5),
            color: row_optional_text(row, 6),
            icon: row_optional_text(row, 7),
            created_at: row_text(row, 8),
            updated_at: row_text(row, 9),
            last_launched_at: row_optional_text(row, 10),
            last_status: EnvironmentStatus::from_db(&row_text(row, 11)),
            is_default_profile: row_i64(row, 14) != 0,
        },
        last_pid: row_u32(row, 12),
        last_pid_started_at: row_i64_optional(row, 13),
    }
}

pub fn list(database: &mut Database) -> AppResult<Vec<Environment>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM environments ORDER BY created_at DESC, name COLLATE NOCASE ASC"
    );
    let rows = database
        .query(&sql, &[])
        .map_err(|error| db_error("无法读取环境列表", error))?;
    Ok(rows
        .iter()
        .map(|row| map_row(row).environment)
        .collect())
}

pub fn list_records(database: &mut Database) -> AppResult<Vec<EnvironmentRecord>> {
    let sql = format!("SELECT {COLUMNS} FROM environments");
    let rows = database
        .query(&sql, &[])
        .map_err(|error| db_error("无法读取环境列表", error))?;
    Ok(rows.iter().map(|row| map_row(row)).collect())
}

pub fn find(database: &mut Database, id: &str) -> AppResult<EnvironmentRecord> {
    let sql = format!("SELECT {COLUMNS} FROM environments WHERE id = ?1 LIMIT 1");
    database
        .query_one(&sql, &[SqlValue::from(id)])
        .map_err(|error| db_error("无法读取环境信息", error))?
        .as_deref()
        .map(map_row)
        .ok_or_else(|| AppError::new("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。"))
}

pub fn find_by_user_data_dir(
    database: &mut Database,
    user_data_dir: &str,
) -> AppResult<Option<EnvironmentRecord>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM environments WHERE user_data_dir = ?1 COLLATE NOCASE LIMIT 1"
    );
    Ok(database
        .query_one(&sql, &[SqlValue::from(user_data_dir)])
        .map_err(|error| db_error("无法检查环境目录", error))?
        .as_deref()
        .map(map_row))
}

pub fn list_directories(database: &mut Database, exclude_id: Option<&str>) -> AppResult<Vec<String>> {
    let rows = match exclude_id {
        Some(id) => database.query(
            "SELECT user_data_dir FROM environments WHERE id != ?1",
            &[SqlValue::from(id)],
        ),
        None => database.query("SELECT user_data_dir FROM environments", &[]),
    }
    .map_err(|error| db_error("无法读取环境目录", error))?;
    Ok(rows.iter().map(|row| row_text(row, 0)).collect())
}

pub fn count(database: &mut Database) -> AppResult<i64> {
    database
        .query_count("SELECT COUNT(*) FROM environments", &[])
        .map_err(|error| db_error("无法读取环境数量", error))
}

pub fn count_for_browser(database: &mut Database, browser_config_id: &str) -> AppResult<i64> {
    database
        .query_count(
            "SELECT COUNT(*) FROM environments WHERE browser_config_id = ?1",
            &[SqlValue::from(browser_config_id)],
        )
        .map_err(|error| db_error("无法读取环境数量", error))
}

pub fn insert(database: &mut Database, record: &EnvironmentRecord) -> AppResult<()> {
    let environment = &record.environment;
    let sql = format!(
        "INSERT INTO environments ({COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"
    );
    database
        .execute(
            &sql,
            &[
                SqlValue::from(&environment.id),
                SqlValue::from(&environment.name),
                SqlValue::from(environment.description.clone()),
                SqlValue::from(&environment.user_data_dir),
                SqlValue::from(environment.source_type.as_str()),
                SqlValue::from(&environment.browser_config_id),
                SqlValue::from(environment.color.clone()),
                SqlValue::from(environment.icon.clone()),
                SqlValue::from(&environment.created_at),
                SqlValue::from(&environment.updated_at),
                SqlValue::from(environment.last_launched_at.clone()),
                SqlValue::from(environment.last_status.as_str()),
                SqlValue::from(record.last_pid.map(|pid| pid as i64)),
                SqlValue::from(record.last_pid_started_at),
                SqlValue::from(if environment.is_default_profile { 1_i64 } else { 0_i64 }),
            ],
        )
        .map_err(|error| duplicate_error("该目录已经在一个浏览器环境中使用。", error))?;
    Ok(())
}

pub fn update_metadata(
    database: &mut Database,
    id: &str,
    name: &str,
    description: Option<&str>,
    color: Option<&str>,
) -> AppResult<Environment> {
    let changed = database
        .execute(
            "UPDATE environments
             SET name = ?2, description = ?3, color = ?4, updated_at = ?5
             WHERE id = ?1",
            &[
                SqlValue::from(id),
                SqlValue::from(name),
                SqlValue::from(description),
                SqlValue::from(color),
                SqlValue::from(crate::models::now_iso()),
            ],
        )
        .map_err(|error| db_error("无法更新环境信息", error))?;
    if changed == 0 {
        return Err(AppError::new(
            "ENVIRONMENT_NOT_FOUND",
            "环境不存在或已被移除。",
        ));
    }
    Ok(find(database, id)?.environment)
}

pub fn find_default_profile(database: &mut Database) -> AppResult<Option<EnvironmentRecord>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM environments WHERE is_default_profile = 1 LIMIT 1"
    );
    Ok(database
        .query_one(&sql, &[])
        .map_err(|error| db_error("无法读取默认环境", error))?
        .as_deref()
        .map(map_row))
}

/// Atomically moves the single default-profile flag to `id`.
pub fn set_default_profile(database: &mut Database, id: &str) -> AppResult<()> {
    database.with_transaction(|transaction| {
        transaction
            .execute(
                "UPDATE environments SET is_default_profile = 0 WHERE is_default_profile = 1",
                &[],
            )
            .map_err(|error| db_error("无法更新默认环境标记", error))?;
        let changed = transaction
            .execute(
                "UPDATE environments
                 SET is_default_profile = 1, updated_at = ?2
                 WHERE id = ?1",
                &[SqlValue::from(id), SqlValue::from(crate::models::now_iso())],
            )
            .map_err(|error| db_error("无法更新默认环境标记", error))?;
        if changed == 0 {
            return Err(AppError::new(
                "ENVIRONMENT_NOT_FOUND",
                "环境不存在或已被移除。",
            ));
        }
        Ok(())
    })
}

pub fn clear_default_profile(database: &mut Database) -> AppResult<()> {
    database
        .execute(
            "UPDATE environments SET is_default_profile = 0 WHERE is_default_profile = 1",
            &[],
        )
        .map_err(|error| db_error("无法清除默认环境标记", error))?;
    Ok(())
}

pub fn update_status(    database: &mut Database,
    id: &str,
    status: EnvironmentStatus,
    pid: Option<u32>,
    pid_started_at: Option<i64>,
) -> AppResult<()> {
    database
        .execute(
            "UPDATE environments
             SET last_status = ?2, last_pid = ?3, last_pid_started_at = ?4
             WHERE id = ?1",
            &[
                SqlValue::from(id),
                SqlValue::from(status.as_str()),
                SqlValue::from(pid.map(|value| value as i64)),
                SqlValue::from(pid_started_at),
            ],
        )
        .map_err(|error| db_error("无法更新环境运行状态", error))?;
    Ok(())
}

pub fn mark_launched(
    database: &mut Database,
    id: &str,
    pid: u32,
    pid_started_at: Option<i64>,
) -> AppResult<()> {
    database
        .execute(
            "UPDATE environments
             SET last_status = 'running', last_pid = ?2, last_pid_started_at = ?3,
                 last_launched_at = ?4, updated_at = ?4
             WHERE id = ?1",
            &[
                SqlValue::from(id),
                SqlValue::from(pid as i64),
                SqlValue::from(pid_started_at),
                SqlValue::from(crate::models::now_iso()),
            ],
        )
        .map_err(|error| db_error("无法记录环境启动状态", error))?;
    Ok(())
}

pub fn mark_restored(database: &mut Database, id: &str) -> AppResult<()> {
    database
        .execute(
            "UPDATE environments
             SET updated_at = ?2, last_status = 'stopped', last_pid = NULL,
                 last_pid_started_at = NULL
             WHERE id = ?1",
            &[
                SqlValue::from(id),
                SqlValue::from(crate::models::now_iso()),
            ],
        )
        .map_err(|error| db_error("无法更新环境恢复状态", error))?;
    Ok(())
}

pub fn remove(database: &mut Database, id: &str) -> AppResult<()> {
    let changed = database
        .execute(
            "DELETE FROM environments WHERE id = ?1",
            &[SqlValue::from(id)],
        )
        .map_err(|error| db_error("无法移除环境", error))?;
    if changed == 0 {
        return Err(AppError::new(
            "ENVIRONMENT_NOT_FOUND",
            "环境不存在或已被移除。",
        ));
    }
    Ok(())
}
