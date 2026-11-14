use crate::errors::{api, ApiResult};
use crate::window as app_window;
use tauri::AppHandle;

#[tauri::command]
pub fn window_minimize(app: AppHandle) -> ApiResult<()> {
    api(|| {
        app_window::minimize(&app);
        Ok(())
    })
}

#[tauri::command]
pub fn window_toggle_maximize(app: AppHandle) -> ApiResult<bool> {
    api(|| Ok(app_window::toggle_maximize(&app)))
}

#[tauri::command]
pub fn window_is_maximized(app: AppHandle) -> ApiResult<bool> {
    api(|| Ok(app_window::is_maximized(&app)))
}

#[tauri::command]
pub fn window_close(app: AppHandle) -> ApiResult<()> {
    api(|| {
        app_window::request_close(&app);
        Ok(())
    })
}
