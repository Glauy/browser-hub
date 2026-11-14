use crate::database::{backups as backups_repo, environments as environments_repo};
use crate::errors::{
    AppError, AppResult, BACKUP_FAILED, BACKUP_LOCATION_INVALID, BACKUP_NOT_FOUND,
    ENVIRONMENT_DIRECTORY_NOT_FOUND, ENVIRONMENT_NOT_FOUND, RESTORE_FAILED,
};
use crate::models::{now_iso, Backup, BackupEnvironmentInput};
use crate::services::app_paths::{
    is_drive_root, is_same_or_descendant, normalize_path, paths_overlap,
};
use crate::services::{environment, filesystem, platform};
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};

pub fn create_backup(state: &AppState, input: BackupEnvironmentInput) -> AppResult<Backup> {
    let record =
        state.with_database(|database| environments_repo::find(database, &input.environment_id))?;
    environment::require_stopped_for_destructive(&record, "创建备份")?;

    let source = PathBuf::from(&record.environment.user_data_dir);
    if !source.is_dir() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "环境目录不存在，无法创建备份。",
        ));
    }
    if platform::is_reparse_point(&source) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "环境目录是符号链接或联接点，BrowserHub 拒绝备份。",
        ));
    }
    let settings = state.settings_snapshot();
    let backup_root = PathBuf::from(settings.effective_backup_root());
    if !backup_root.is_absolute() {
        return Err(AppError::new(
            BACKUP_LOCATION_INVALID,
            "默认备份目录必须是完整的绝对路径，请先在设置中重新选择。",
        ));
    }
    if paths_overlap(&backup_root, &source) {
        return Err(AppError::new(
            BACKUP_LOCATION_INVALID,
            "备份目录不能位于环境目录中，也不能包含环境目录。",
        ));
    }
    if is_drive_root(&backup_root)
        || paths_overlap(&backup_root, &state.paths.app_data_dir)
        || filesystem::is_dangerous_delete_target(&backup_root)
    {
        return Err(AppError::new(
            BACKUP_LOCATION_INVALID,
            "默认备份目录不可用，请选择一个普通文件夹。",
        ));
    }
    let environment_directories = state
        .with_database(|database| environments_repo::list_directories(database, None))?;
    if environment_directories
        .iter()
        .any(|directory| paths_overlap(&backup_root, Path::new(directory)))
    {
        return Err(AppError::new(
            BACKUP_LOCATION_INVALID,
            "备份目录不能与任何环境目录重叠。",
        ));
    }
    filesystem::prepare_directory(&backup_root).map_err(|error| {
        AppError::new(
            BACKUP_LOCATION_INVALID,
            format!("无法使用默认备份目录：{}", error.message),
        )
    })?;

    let (source_size, source_files) = filesystem::directory_stats(&source)?;
    if let Some((available, _)) = platform::disk_space(&backup_root) {
        if available < source_size.saturating_add(32 * 1024 * 1024) {
            return Err(AppError::new(
                BACKUP_FAILED,
                "备份磁盘可用空间不足，请释放空间后重试。",
            ));
        }
    }

    let destination = filesystem::unique_backup_directory(&backup_root, &record.environment.name);
    log::info!(
        "creating backup for environment {} ({} files, {} bytes) at {}",
        record.environment.id,
        source_files,
        source_size,
        destination.display()
    );
    if let Err(error) = filesystem::copy_tree(&source, &destination) {
        let _ = filesystem::remove_tree(&destination);
        return Err(error);
    }

    let (size_bytes, file_count) = match filesystem::directory_stats(&destination) {
        Ok(stats) => stats,
        Err(error) => {
            let _ = filesystem::remove_tree(&destination);
            return Err(error);
        }
    };
    if file_count == 0 && source_files > 0 {
        let _ = filesystem::remove_tree(&destination);
        return Err(AppError::new(
            BACKUP_FAILED,
            "备份结果为空，已取消本次备份。请检查环境目录的读取权限。",
        ));
    }

    let backup = Backup {
        id: format!("backup_{}", &uuid::Uuid::new_v4().simple().to_string()[..12]),
        environment_id: record.environment.id.clone(),
        environment_name: record.environment.name.clone(),
        path: normalize_path(&destination),
        size_bytes,
        created_at: now_iso(),
        note: input
            .note
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        environment_exists: true,
    };

    if let Err(error) = state.with_database(|database| backups_repo::insert(database, &backup)) {
        log::error!("backup copy succeeded but the database insert failed; removing copy");
        let _ = filesystem::remove_tree(&destination);
        return Err(error);
    }

    log::info!("backup {} created at {}", backup.id, backup.path);
    Ok(backup)
}

pub fn list_backups(state: &AppState) -> AppResult<Vec<Backup>> {
    state.with_database(backups_repo::list)
}

pub fn restore_backup(state: &AppState, backup_id: &str) -> AppResult<()> {
    let backup = state.with_database(|database| backups_repo::find(database, backup_id))?;
    let record = match state.with_database(|database| {
        environments_repo::find(database, &backup.environment_id)
    }) {
        Ok(record) => record,
        Err(_) => {
            return Err(AppError::new(
                ENVIRONMENT_NOT_FOUND,
                "该备份对应的环境已被移除。请先重新导入原目录，再恢复备份。",
            ))
        }
    };
    environment::require_stopped_for_destructive(&record, "恢复备份")?;

    let backup_path = PathBuf::from(&backup.path);
    if !backup_path.is_dir() {
        return Err(AppError::new(
            BACKUP_NOT_FOUND,
            "备份目录不存在，可能已被移动或删除。",
        ));
    }
    let environment_path = PathBuf::from(&record.environment.user_data_dir);
    if !environment_path.is_dir() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "当前环境目录不存在，无法安全恢复。请重新创建或导入环境。",
        ));
    }
    if paths_overlap(&backup_path, &environment_path) {
        return Err(AppError::new(
            BACKUP_LOCATION_INVALID,
            "备份目录与当前环境目录重叠，已拒绝恢复。",
        ));
    }
    state.with_database(|database| {
        environment::ensure_not_reserved(state, database, &environment_path, Some(&record.environment.id))
    })?;

    log::info!(
        "restoring backup {} into environment {}",
        backup_id,
        record.environment.id
    );
    let previous = filesystem::move_to_sibling(&environment_path, "browserhub-restore-old")?;
    if let Err(error) = filesystem::copy_tree(&backup_path, &environment_path) {
        log::error!("restore copy failed: {error}; rolling back");
        let _ = filesystem::remove_tree(&environment_path);
        if let Err(rollback) = fs::rename(&previous, &environment_path) {
            log::error!(
                "CRITICAL: restore failed and the previous environment could not be restored: {rollback}"
            );
            return Err(AppError::with_detail(
                RESTORE_FAILED,
                "恢复失败，且原环境目录无法自动还原。原目录已保存在临时位置，请勿删除。",
                format!("{} | rollback: {rollback}", error.message),
            ));
        }
        return Err(AppError::with_detail(
            RESTORE_FAILED,
            "恢复备份失败，原环境已回滚。请检查磁盘空间和目录权限后重试。",
            error.message,
        ));
    }

    if let Err(error) = filesystem::remove_tree(&previous) {
        log::warn!(
            "restored environment, but the previous copy could not be removed ({}): {error}",
            previous.display()
        );
    }
    if let Err(error) = state.with_database(|database| {
        environments_repo::mark_restored(database, &record.environment.id)
    }) {
        log::warn!("restore succeeded but environment metadata was not updated: {error}");
    }
    log::info!("backup {} restored successfully", backup_id);
    Ok(())
}

pub fn delete_backup(state: &AppState, backup_id: &str) -> AppResult<()> {
    let backup = state.with_database(|database| backups_repo::find(database, backup_id))?;
    let path = PathBuf::from(&backup.path);

    if path.exists() {
        if !path.is_dir() {
            return Err(AppError::new(
                "BACKUP_DELETE_FAILED",
                "备份路径不是文件夹，已拒绝删除。",
            ));
        }
        if is_drive_root(&path)
            || paths_overlap(&path, &state.paths.app_data_dir)
            || filesystem::is_dangerous_delete_target(&path)
        {
            return Err(AppError::new(
                "BACKUP_DELETE_FAILED",
                "备份路径属于受保护目录，已拒绝删除。",
            ));
        }
        let settings = state.settings_snapshot();
        let backup_root = PathBuf::from(settings.effective_backup_root());
        if is_same_or_descendant(&backup_root, &path) {
            return Err(AppError::new(
                "BACKUP_DELETE_FAILED",
                "该路径包含默认备份目录，已拒绝删除。",
            ));
        }
        let environment_directories = state
            .with_database(|database| environments_repo::list_directories(database, None))?;
        if environment_directories
            .iter()
            .any(|directory| paths_overlap(&path, Path::new(directory)))
        {
            return Err(AppError::new(
                "BACKUP_DELETE_FAILED",
                "备份路径与浏览器环境目录重叠，已拒绝删除。",
            ));
        }
        let other_backups = state.with_database(backups_repo::list)?;
        if other_backups.iter().any(|other| {
            other.id != backup.id && is_same_or_descendant(Path::new(&other.path), &path)
        }) {
            return Err(AppError::new(
                "BACKUP_DELETE_FAILED",
                "该路径包含其他备份，已拒绝删除。",
            ));
        }
        filesystem::remove_tree(&path)?;
    }

    state.with_database(|database| backups_repo::delete(database, backup_id))?;
    log::info!("backup {backup_id} deleted");
    Ok(())
}
