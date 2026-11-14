use super::{
    db_error, row_i64, row_optional_text, row_text, Database, SqlValue,
};
use crate::errors::{AppError, AppResult};
use crate::models::Backup;

const SELECT: &str = "SELECT b.id, b.environment_id, b.environment_name, b.path, \
     b.size_bytes, b.created_at, b.note, \
     EXISTS(SELECT 1 FROM environments e WHERE e.id = b.environment_id) AS environment_exists \
     FROM backups b";

fn map_row(row: &[SqlValue]) -> Backup {
    Backup {
        id: row_text(row, 0),
        environment_id: row_text(row, 1),
        environment_name: row_text(row, 2),
        path: row_text(row, 3),
        size_bytes: row_i64(row, 4).max(0) as u64,
        created_at: row_text(row, 5),
        note: row_optional_text(row, 6),
        environment_exists: row_i64(row, 7) != 0,
    }
}

pub fn list(database: &mut Database) -> AppResult<Vec<Backup>> {
    let sql = format!("{SELECT} ORDER BY b.created_at DESC, b.id DESC");
    let rows = database
        .query(&sql, &[])
        .map_err(|error| db_error("无法读取备份列表", error))?;
    Ok(rows.iter().map(|row| map_row(row)).collect())
}

pub fn find(database: &mut Database, id: &str) -> AppResult<Backup> {
    let sql = format!("{SELECT} WHERE b.id = ?1 LIMIT 1");
    database
        .query_one(&sql, &[SqlValue::from(id)])
        .map_err(|error| db_error("无法读取备份信息", error))?
        .as_deref()
        .map(map_row)
        .ok_or_else(|| AppError::new("BACKUP_NOT_FOUND", "备份不存在或已被删除。"))
}

pub fn count(database: &mut Database) -> AppResult<i64> {
    database
        .query_count("SELECT COUNT(*) FROM backups", &[])
        .map_err(|error| db_error("无法读取备份数量", error))
}

pub fn insert(database: &mut Database, backup: &Backup) -> AppResult<()> {
    database
        .execute(
            "INSERT INTO backups (id, environment_id, environment_name, path, size_bytes, created_at, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            &[
                SqlValue::from(&backup.id),
                SqlValue::from(&backup.environment_id),
                SqlValue::from(&backup.environment_name),
                SqlValue::from(&backup.path),
                SqlValue::from(backup.size_bytes.min(i64::MAX as u64) as i64),
                SqlValue::from(&backup.created_at),
                SqlValue::from(backup.note.clone()),
            ],
        )
        .map_err(|error| db_error("无法保存备份记录", error))?;
    Ok(())
}

pub fn delete(database: &mut Database, id: &str) -> AppResult<()> {
    let changed = database
        .execute("DELETE FROM backups WHERE id = ?1", &[SqlValue::from(id)])
        .map_err(|error| db_error("无法删除备份记录", error))?;
    if changed == 0 {
        return Err(AppError::new(
            "BACKUP_NOT_FOUND",
            "备份不存在或已被删除。",
        ));
    }
    Ok(())
}
