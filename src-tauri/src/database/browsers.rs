use super::{
    db_error, duplicate_error, row_i64, row_optional_text, row_text, Database, SqlValue,
};
use crate::errors::{AppError, AppResult};
use crate::models::BrowserConfig;

const COLUMNS: &str =
    "id, name, executable_path, version, is_default, created_at, updated_at";

fn map_row(row: &[SqlValue]) -> BrowserConfig {
    BrowserConfig {
        id: row_text(row, 0),
        name: row_text(row, 1),
        executable_path: row_text(row, 2),
        version: row_optional_text(row, 3),
        is_default: row_i64(row, 4) != 0,
        created_at: row_text(row, 5),
        updated_at: row_text(row, 6),
    }
}

pub fn list(database: &mut Database) -> AppResult<Vec<BrowserConfig>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM browser_configs ORDER BY is_default DESC, created_at ASC"
    );
    let rows = database
        .query(&sql, &[])
        .map_err(|error| db_error("无法读取 Chrome 配置", error))?;
    Ok(rows.iter().map(|row| map_row(row)).collect())
}

pub fn find(database: &mut Database, id: &str) -> AppResult<BrowserConfig> {
    let sql = format!("SELECT {COLUMNS} FROM browser_configs WHERE id = ?1 LIMIT 1");
    database
        .query_one(&sql, &[SqlValue::from(id)])
        .map_err(|error| db_error("无法读取 Chrome 配置", error))?
        .as_deref()
        .map(map_row)
        .ok_or_else(|| AppError::new("BROWSER_CONFIG_NOT_FOUND", "Chrome 配置不存在或已被删除。"))
}

pub fn find_optional(database: &mut Database, id: &str) -> AppResult<Option<BrowserConfig>> {
    let sql = format!("SELECT {COLUMNS} FROM browser_configs WHERE id = ?1 LIMIT 1");
    Ok(database
        .query_one(&sql, &[SqlValue::from(id)])
        .map_err(|error| db_error("无法读取 Chrome 配置", error))?
        .as_deref()
        .map(map_row))
}

pub fn find_by_path(
    database: &mut Database,
    executable_path: &str,
) -> AppResult<Option<BrowserConfig>> {
    let sql = format!(
        "SELECT {COLUMNS} FROM browser_configs WHERE executable_path = ?1 COLLATE NOCASE LIMIT 1"
    );
    Ok(database
        .query_one(&sql, &[SqlValue::from(executable_path)])
        .map_err(|error| db_error("无法读取 Chrome 配置", error))?
        .as_deref()
        .map(map_row))
}

pub fn find_default(database: &mut Database) -> AppResult<Option<BrowserConfig>> {
    let sql = format!("SELECT {COLUMNS} FROM browser_configs WHERE is_default = 1 LIMIT 1");
    Ok(database
        .query_one(&sql, &[])
        .map_err(|error| db_error("无法读取默认 Chrome 配置", error))?
        .as_deref()
        .map(map_row))
}

pub fn count(database: &mut Database) -> AppResult<i64> {
    database
        .query_count("SELECT COUNT(*) FROM browser_configs", &[])
        .map_err(|error| db_error("无法读取 Chrome 配置数量", error))
}

pub fn insert(database: &mut Database, config: &BrowserConfig) -> AppResult<()> {
    let sql = format!(
        "INSERT INTO browser_configs ({COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    );
    database
        .execute(
            &sql,
            &[
                SqlValue::from(&config.id),
                SqlValue::from(&config.name),
                SqlValue::from(&config.executable_path),
                SqlValue::from(config.version.clone()),
                SqlValue::from(if config.is_default { 1_i64 } else { 0_i64 }),
                SqlValue::from(&config.created_at),
                SqlValue::from(&config.updated_at),
            ],
        )
        .map_err(|error| duplicate_error("该 Chrome 安装已经添加过了。", error))?;
    Ok(())
}

pub fn update(database: &mut Database, config: &BrowserConfig) -> AppResult<()> {
    let sql = "UPDATE browser_configs
               SET name = ?2, executable_path = ?3, version = ?4, is_default = ?5, updated_at = ?6
               WHERE id = ?1";
    let changed = database
        .execute(
            sql,
            &[
                SqlValue::from(&config.id),
                SqlValue::from(&config.name),
                SqlValue::from(&config.executable_path),
                SqlValue::from(config.version.clone()),
                SqlValue::from(if config.is_default { 1_i64 } else { 0_i64 }),
                SqlValue::from(&config.updated_at),
            ],
        )
        .map_err(|error| duplicate_error("该 Chrome 安装已经添加过了。", error))?;
    if changed == 0 {
        return Err(AppError::new(
            "BROWSER_CONFIG_NOT_FOUND",
            "Chrome 配置不存在或已被删除。",
        ));
    }
    Ok(())
}

pub fn set_default(database: &mut Database, id: &str) -> AppResult<()> {
    database.with_transaction(|transaction| {
        transaction
            .execute("UPDATE browser_configs SET is_default = 0 WHERE is_default = 1", &[])
            .map_err(|error| db_error("无法更新默认 Chrome 配置", error))?;
        let changed = transaction
            .execute(
                "UPDATE browser_configs SET is_default = 1, updated_at = ?2 WHERE id = ?1",
                &[SqlValue::from(id), SqlValue::from(crate::models::now_iso())],
            )
            .map_err(|error| db_error("无法更新默认 Chrome 配置", error))?;
        if changed == 0 {
            return Err(AppError::new(
                "BROWSER_CONFIG_NOT_FOUND",
                "Chrome 配置不存在或已被删除。",
            ));
        }
        Ok(())
    })
}

pub fn clear_default(database: &mut Database) -> AppResult<()> {
    database
        .execute("UPDATE browser_configs SET is_default = 0 WHERE is_default = 1", &[])
        .map_err(|error| db_error("无法更新默认 Chrome 配置", error))?;
    Ok(())
}

pub fn delete(database: &mut Database, id: &str) -> AppResult<()> {
    let changed = database
        .execute(
            "DELETE FROM browser_configs WHERE id = ?1",
            &[SqlValue::from(id)],
        )
        .map_err(|error| db_error("无法删除 Chrome 配置", error))?;
    if changed == 0 {
        return Err(AppError::new(
            "BROWSER_CONFIG_NOT_FOUND",
            "Chrome 配置不存在或已被删除。",
        ));
    }
    Ok(())
}
