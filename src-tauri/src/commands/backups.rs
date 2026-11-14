use crate::errors::{api_blocking, ApiResult};
use crate::models::{Backup, BackupEnvironmentInput};
use crate::services::backup;
use tauri::AppHandle;

#[tauri::command]
pub async fn backup_environment(
    app: AppHandle,
    input: BackupEnvironmentInput,
) -> ApiResult<Backup> {
    api_blocking(app, move |state| backup::create_backup(state, input)).await
}

#[tauri::command]
pub async fn list_backups(app: AppHandle) -> ApiResult<Vec<Backup>> {
    api_blocking(app, |state| backup::list_backups(state)).await
}

#[tauri::command]
pub async fn restore_environment(app: AppHandle, backup_id: String) -> ApiResult<()> {
    api_blocking(app, move |state| {
        backup::restore_backup(state, &backup_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_backup(app: AppHandle, backup_id: String) -> ApiResult<()> {
    api_blocking(app, move |state| backup::delete_backup(state, &backup_id)).await
}
