use crate::errors::{api_blocking, ApiResult};
use crate::models::{
    BrowserConfig, CreateBrowserConfigInput, DetectedChrome, UpdateBrowserConfigInput,
};
use crate::services::environment;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_browser_configs(app: AppHandle) -> ApiResult<Vec<BrowserConfig>> {
    api_blocking(app, |state| environment::get_browser_configs(state)).await
}

#[tauri::command]
pub async fn detect_chrome(app: AppHandle) -> ApiResult<Vec<DetectedChrome>> {
    api_blocking(app, |_state| Ok(environment::detect_chrome())).await
}

#[tauri::command]
pub async fn create_browser_config(
    app: AppHandle,
    input: CreateBrowserConfigInput,
) -> ApiResult<BrowserConfig> {
    api_blocking(app, move |state| {
        environment::create_browser_config(state, input)
    })
    .await
}

#[tauri::command]
pub async fn update_browser_config(
    app: AppHandle,
    input: UpdateBrowserConfigInput,
) -> ApiResult<BrowserConfig> {
    api_blocking(app, move |state| {
        environment::update_browser_config(state, input)
    })
    .await
}

#[tauri::command]
pub async fn delete_browser_config(
    app: AppHandle,
    browser_config_id: String,
) -> ApiResult<()> {
    api_blocking(app, move |state| {
        environment::delete_browser_config(state, &browser_config_id)
    })
    .await
}
