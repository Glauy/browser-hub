use crate::models::{CloseBehavior, WindowStateFile};
use crate::state::AppState;
use std::fs;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

pub fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

pub fn restore_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = main_window(app) else {
        return Err("main window is not available".to_string());
    };
    let Some(state) = app.try_state::<AppState>() else {
        return Ok(());
    };
    let path = &state.paths.window_state_path;
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(_) => return Ok(()),
    };
    let saved: WindowStateFile = match serde_json::from_str(&content) {
        Ok(saved) => saved,
        Err(error) => {
            log::warn!("window state could not be parsed: {error}");
            return Ok(());
        }
    };

    let width = saved.width.clamp(980, 10_000);
    let height = saved.height.clamp(620, 10_000);
    if width >= 980 && height >= 620 {
        let _ = window.set_size(PhysicalSize::new(width, height));
    }

    if saved.x != 0 || saved.y != 0 {
        let visible = window
            .available_monitors()
            .map(|monitors| {
                monitors.iter().any(|monitor| {
                    let position = monitor.position();
                    let size = monitor.size();
                    saved.x >= position.x - 40
                        && saved.y >= position.y - 40
                        && saved.x < position.x + size.width as i32 - 80
                        && saved.y < position.y + size.height as i32 - 80
                })
            })
            .unwrap_or(false);
        if visible {
            let _ = window.set_position(PhysicalPosition::new(saved.x, saved.y));
        }
    }

    if saved.maximized {
        let _ = window.maximize();
    }
    Ok(())
}

pub fn save_state(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let position = window.outer_position().ok();
    let size = window.inner_size().ok();
    let maximized = window.is_maximized().unwrap_or(false);
    let saved = WindowStateFile {
        x: position.map(|value| value.x).unwrap_or(0),
        y: position.map(|value| value.y).unwrap_or(0),
        width: size.map(|value| value.width).unwrap_or(1200),
        height: size.map(|value| value.height).unwrap_or(760),
        maximized,
    };
    match serde_json::to_string_pretty(&saved) {
        Ok(content) => {
            if let Err(error) = fs::write(&state.paths.window_state_path, content) {
                log::warn!("could not save window state: {error}");
            }
        }
        Err(error) => log::warn!("could not serialize window state: {error}"),
    }
}

pub fn install_close_handler(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let app_handle = app.clone();
    let window_handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let behavior = app_handle
                .try_state::<AppState>()
                .map(|state| state.settings_snapshot().close_behavior)
                .unwrap_or_default();
            save_state(&app_handle);
            if behavior == CloseBehavior::Minimize {
                api.prevent_close();
                if let Err(error) = window_handle.hide() {
                    log::warn!("could not hide BrowserHub window: {error}");
                }
            }
        }
    });
}

pub fn minimize(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    // Hide-to-tray whenever the tray is available (always on Windows). This
    // keeps the taskbar clean: the only visible token is the tray icon.
    if let Err(error) = window.hide() {
        log::warn!("could not hide BrowserHub window: {error}");
    }
}

pub fn toggle_maximize(app: &AppHandle) -> bool {
    let Some(window) = main_window(app) else {
        return false;
    };
    let maximized = window.is_maximized().unwrap_or(false);
    let result = if maximized {
        window.unmaximize()
    } else {
        window.maximize()
    };
    if let Err(error) = result {
        log::warn!("could not toggle maximize state: {error}");
        return maximized;
    }
    !maximized
}

pub fn is_maximized(app: &AppHandle) -> bool {
    main_window(app)
        .and_then(|window| window.is_maximized().ok())
        .unwrap_or(false)
}

pub fn show_main_window(app: &AppHandle) {
    let Some(window) = main_window(app) else {
        return;
    };
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Applies the close behavior for titlebar-initiated close requests. Chrome is
/// never touched here; BrowserHub exiting must not close browser windows.
pub fn request_close(app: &AppHandle) {
    let behavior = app
        .try_state::<AppState>()
        .map(|state| state.settings_snapshot().close_behavior)
        .unwrap_or_default();
    save_state(app);
    if behavior == CloseBehavior::Minimize {
        if let Some(window) = main_window(app) {
            if let Err(error) = window.hide() {
                log::warn!("could not hide BrowserHub window: {error}");
            }
        }
    } else {
        app.exit(0);
    }
}

/// Tray "exit" must really stop BrowserHub regardless of close behavior.
pub fn exit_application(app: &AppHandle) {
    save_state(app);
    app.exit(0);
}
