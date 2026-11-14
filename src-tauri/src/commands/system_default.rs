use crate::errors::{api_blocking, ApiResult};
use crate::services::system_default::{
    self, SystemDefaultRow, SystemDefaultState,
};use tauri::AppHandle;

#[tauri::command]
pub async fn get_system_default_state(app: AppHandle) -> ApiResult<SystemDefaultState> {
    api_blocking(app, |state| Ok(system_default::read_state(state))).await
}

/// Take over: point User Data at the managed env_default directory.
#[tauri::command]
pub async fn take_over_system_default(app: AppHandle) -> ApiResult<String> {
    api_blocking(app, |state| system_default::take_over(state)).await
}

/// One-shot copy of the current User Data content into env_default.
#[tauri::command]
pub async fn sync_system_default_profile(app: AppHandle) -> ApiResult<(u64, u64)> {
    api_blocking(app, |state| system_default::sync_default_profile_data(state)).await
}

#[tauri::command]
pub async fn restore_system_default(app: AppHandle) -> ApiResult<()> {
    api_blocking(app, |state| system_default::restore(state)).await
}

/// Everything the environments list needs to render the special
/// "系统默认 Chrome" row: managed state, live status, size.
#[tauri::command]
pub async fn get_system_default_row(app: AppHandle) -> ApiResult<SystemDefaultRow> {
    api_blocking(app, |state| system_default::read_system_default_row(state)).await
}

#[tauri::command]
pub async fn launch_system_default_chrome(app: AppHandle) -> ApiResult<u32> {
    api_blocking(app, |state| system_default::launch_default_chrome(state)).await
}
