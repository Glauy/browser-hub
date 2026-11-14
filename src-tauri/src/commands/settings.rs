use crate::errors::{api, api_blocking, ApiResult};
use crate::models::{
    AppSettings, BootstrapState, CompleteSetupInput, DirectoryInspection, StorageInfo,
};
use crate::services::environment;
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_bootstrap_state(app: AppHandle) -> ApiResult<BootstrapState> {
    api_blocking(app, |state| environment::get_bootstrap_state(state)).await
}

#[tauri::command]
pub fn get_app_settings(state: State<'_, AppState>) -> ApiResult<AppSettings> {
    api(|| environment::get_app_settings(state.inner()))
}

#[tauri::command]
pub async fn update_app_settings(app: AppHandle, settings: AppSettings) -> ApiResult<AppSettings> {
    api_blocking(app, move |state| {
        environment::update_app_settings(state, settings)
    })
    .await
}

#[tauri::command]
pub async fn complete_setup(
    app: AppHandle,
    environment_root_dir: String,
    backup_root_dir: Option<String>,
    chrome_executable_path: Option<String>,
) -> ApiResult<()> {
    let input = CompleteSetupInput {
        environment_root_dir,
        backup_root_dir,
        chrome_executable_path,
    };
    api_blocking(app, move |state| environment::complete_setup(state, input)).await
}

#[tauri::command]
pub async fn select_directory(
    app: AppHandle,
    initial_dir: Option<String>,
    title: Option<String>,
) -> ApiResult<Option<String>> {
    api_blocking(app, move |_state| {
        environment::select_directory(initial_dir, title)
    })
    .await
}

#[tauri::command]
pub async fn select_executable(
    app: AppHandle,
    title: Option<String>,
) -> ApiResult<Option<String>> {
    api_blocking(app, move |_state| environment::select_executable(title)).await
}

#[tauri::command]
pub async fn get_storage_info(app: AppHandle, path: String) -> ApiResult<StorageInfo> {
    api_blocking(app, move |state| environment::get_storage_info(state, &path)).await
}

#[tauri::command]
pub async fn inspect_environment_directory(
    app: AppHandle,
    path: String,
) -> ApiResult<DirectoryInspection> {
    api_blocking(app, move |state| {
        environment::inspect_environment_directory(state, &path)
    })
    .await
}

#[tauri::command]
pub async fn open_directory(app: AppHandle, path: String) -> ApiResult<()> {
    api_blocking(app, move |_state| environment::open_directory(&path)).await
}
