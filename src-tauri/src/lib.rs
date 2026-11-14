mod commands;
mod database;
mod errors;
mod models;
mod services;
mod state;
mod tray;
mod window;

use crate::services::app_paths::AppPaths;
use crate::services::logging;
use crate::services::platform;
use crate::state::AppState;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

fn initialize(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    create_main_window(app)?;
    if let Err(error) = window::restore_state(app) {
        log::warn!("could not restore window state: {error}");
    }
    window::install_close_handler(app);
    tray::setup(app)?;
    window::show_main_window(app);
    Ok(())
}

/// Builds the main window in code instead of config so the WebView2 user-data
/// folder can be placed inside our own data directory. Tauri's default
/// (`%LOCALAPPDATA%\<identifier>`) would scatter a second top-level folder
/// next to `forga.space`; the product root must stay unique.
fn create_main_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();
    let webview_data = state.paths.webview_data_dir.clone();
    std::fs::create_dir_all(&webview_data)?;

    let config = &app.config().app.windows[0];
    WebviewWindowBuilder::from_config(app, config)?
        .data_directory(webview_data)
        .build()?;
    Ok(())
}

pub fn run() {
    if !platform::acquire_single_instance() {
        platform::focus_existing_window();
        return;
    }

    let paths = match AppPaths::resolve() {
        Ok(paths) => paths,
        Err(error) => {
            platform::show_native_error(
                "BrowserHub 无法启动",
                &format!(
                    "{}\n\n请检查当前用户的 LOCALAPPDATA 环境变量和应用数据目录权限。",
                    error.message
                ),
            );
            return;
        }
    };

    logging::init(&paths.logs_dir);
    log::info!("BrowserHub {} starting", env!("CARGO_PKG_VERSION"));

    let state = match AppState::new(paths) {
        Ok(state) => state,
        Err(error) => {
            log::error!("application state initialization failed [{}]: {}", error.code, error.message);
            platform::show_native_error(
                "BrowserHub 无法启动",
                &format!(
                    "{}\n\n详细信息已写入本地日志。",
                    error.message
                ),
            );
            return;
        }
    };

    let builder = tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(error) = initialize(&handle) {
                log::error!("UI initialization failed: {error}");
                platform::show_native_error(
                    "BrowserHub 无法启动",
                    "初始化主窗口或系统托盘失败。请重新启动应用，或查看本地日志。",
                );
                return Err(error);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_bootstrap_state,
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
            commands::settings::complete_setup,
            commands::settings::select_directory,
            commands::settings::select_executable,
            commands::settings::get_storage_info,
            commands::settings::inspect_environment_directory,
            commands::settings::open_directory,
            commands::environments::list_environments,
            commands::environments::create_environment,
            commands::environments::import_environment,
            commands::environments::update_environment,
            commands::environments::remove_environment,
            commands::environments::delete_environment,
            commands::environments::launch_environment,
            commands::environments::get_environment_status,
            commands::environments::refresh_environment_status,
            commands::environments::get_environment_stats,
            commands::browsers::get_browser_configs,
            commands::browsers::detect_chrome,
            commands::browsers::create_browser_config,
            commands::browsers::update_browser_config,
            commands::browsers::delete_browser_config,
            commands::backups::backup_environment,
            commands::backups::list_backups,
            commands::backups::restore_environment,
            commands::backups::delete_backup,
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_is_maximized,
            commands::window::window_close,
        ]);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            log::error!("Tauri application failed to build: {error}");
            platform::show_native_error(
                "BrowserHub 无法启动",
                "应用资源初始化失败。请重新安装 BrowserHub。",
            );
            return;
        }
    };

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            window::save_state(app_handle);
            log::info!("BrowserHub exiting");
        }
    });
}
