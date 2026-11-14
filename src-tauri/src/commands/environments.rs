use crate::errors::{api_blocking, ApiResult};
use crate::models::{
    CreateEnvironmentInput, Environment, EnvironmentStats, EnvironmentStatusInfo,
    ImportEnvironmentInput, UpdateEnvironmentInput,
};
use crate::services::environment;
use tauri::AppHandle;

#[tauri::command]
pub async fn list_environments(app: AppHandle) -> ApiResult<Vec<Environment>> {
    api_blocking(app, |state| environment::list_environments(state)).await
}

#[tauri::command]
pub async fn create_environment(
    app: AppHandle,
    input: CreateEnvironmentInput,
) -> ApiResult<Environment> {
    api_blocking(app, move |state| {
        environment::create_environment(state, input)
    })
    .await
}

#[tauri::command]
pub async fn import_environment(
    app: AppHandle,
    input: ImportEnvironmentInput,
) -> ApiResult<Environment> {
    api_blocking(app, move |state| {
        environment::import_environment(state, input)
    })
    .await
}

#[tauri::command]
pub async fn update_environment(
    app: AppHandle,
    input: UpdateEnvironmentInput,
) -> ApiResult<Environment> {
    api_blocking(app, move |state| {
        environment::update_environment(state, input)
    })
    .await
}

#[tauri::command]
pub async fn remove_environment(app: AppHandle, environment_id: String) -> ApiResult<()> {
    api_blocking(app, move |state| {
        environment::remove_environment(state, &environment_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_environment(app: AppHandle, environment_id: String) -> ApiResult<()> {
    api_blocking(app, move |state| {
        environment::delete_environment(state, &environment_id)
    })
    .await
}

#[tauri::command]
pub async fn launch_environment(
    app: AppHandle,
    environment_id: String,
) -> ApiResult<EnvironmentStatusInfo> {
    api_blocking(app, move |state| {
        environment::launch_environment(state, &environment_id)
    })
    .await
}

#[tauri::command]
pub async fn get_environment_status(
    app: AppHandle,
    environment_id: String,
) -> ApiResult<EnvironmentStatusInfo> {
    api_blocking(app, move |state| {
        environment::get_environment_status(state, &environment_id)
    })
    .await
}

#[tauri::command]
pub async fn refresh_environment_status(
    app: AppHandle,
) -> ApiResult<Vec<EnvironmentStatusInfo>> {
    api_blocking(app, |state| environment::refresh_environment_status(state)).await
}

#[tauri::command]
pub async fn get_environment_stats(
    app: AppHandle,
    environment_id: String,
) -> ApiResult<EnvironmentStats> {
    api_blocking(app, move |state| {
        environment::get_environment_stats(state, &environment_id)
    })
    .await
}
