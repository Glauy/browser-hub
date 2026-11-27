use crate::models::{CloseBehavior, WindowStateFile};
use crate::services::platform::{ask_recovery, relaunch_now, RecoveryChoice};
use crate::services::webview_health;
use crate::state::AppState;
use std::fs;
use std::sync::atomic::{AtomicIsize, Ordering};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

/// Raw HWND of the main window. Stored as an integer so the watchdog thread can
/// use it without calling into Tauri (whose window accessors are synchronously
/// marshalled onto the UI thread and would deadlock whenever the UI thread is
/// stuck).
static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);

pub fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("main")
}

pub fn remember_main_hwnd(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        MAIN_HWND.store(hwnd.0 as usize as isize, Ordering::SeqCst);
    }
}

pub fn raw_main_hwnd() -> Option<windows_sys::Win32::Foundation::HWND> {
    let raw = MAIN_HWND.load(Ordering::SeqCst);
    if raw == 0 {
        None
    } else {
        Some(raw as usize as *mut core::ffi::c_void)
    }
}

/// Every window operation that notifies child windows synchronously
/// (show/hide/minimize/maximize) can block forever when the WebView2 browser
/// process is frozen. Check first; on failure offer restart/exit instead of
/// touching the window.
fn ensure_webview_responsive() -> bool {
    let Some(hwnd) = raw_main_hwnd() else {
        return true;
    };

    // The crash signature from 2026-11-22: the WebView2 browser process was
    // frozen by WER with all threads suspended. Restarting is the only fix, so
    // do it without a dialog — the user just wanted the window to open.
    if webview_health::is_webview_suspended(hwnd) {
        log::warn!("webview is suspended (crash zombie); restarting automatically");
        crate::services::platform::relaunch_now();
    }

    if webview_health::is_webview_responsive(hwnd) {
        return true;
    }

    log::warn!("window operation blocked: webview is not responding");
    match ask_recovery(
        "BrowserHub 渲染进程无响应",
        "WebView2 渲染进程可能已经崩溃或被系统挂起。此时显示、隐藏或调整窗口都可能让界面永久卡死。",
        true,
    ) {
        RecoveryChoice::Restart => relaunch_now(),
        RecoveryChoice::Exit => {
            log::warn!("user chose to exit after webview failure");
            std::process::exit(0);
        }
        RecoveryChoice::Cancel => {}
    }
    false
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
                if !ensure_webview_responsive() {
                    return;
                }
                if let Err(error) = window_handle.hide() {
                    log::warn!("could not hide BrowserHub window: {error}");
                }
            }
        }
    });
}

pub fn minimize(app: &AppHandle) {
    if !ensure_webview_responsive() {
        return;
    }
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
    if !ensure_webview_responsive() {
        return is_maximized(app);
    }
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

/// Show requested by a tray click or a second instance. Refuses to enter the
/// blocking `ShowWindow` path when the webview is already wedged.
pub fn show_main_window(app: &AppHandle) {
    if !ensure_webview_responsive() {
        return;
    }
    force_show_main_window(app);
}

/// Startup only: the webview may still be initializing, so skip the probe. The
/// watchdog takes over a few seconds later.
pub fn show_main_window_at_startup(app: &AppHandle) {
    force_show_main_window(app);
}

fn force_show_main_window(app: &AppHandle) {
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
        if !ensure_webview_responsive() {
            return;
        }
        if let Some(window) = main_window(app) {
            if let Err(error) = window.hide() {
                log::warn!("could not hide BrowserHub window: {error}");
            }
        }
    } else {
        log::warn!("BrowserHub exiting (window close)");
        std::process::exit(0);
    }
}

/// Tray "exit" must really stop BrowserHub regardless of close behavior.
/// `std::process::exit` is used instead of `app.exit` so a dead webview cannot
/// block teardown; Chrome lives in separate processes and is unaffected.
pub fn exit_application(app: &AppHandle) {
    save_state(app);
    log::warn!("BrowserHub exiting (tray action)");
    std::process::exit(0);
}

/// Tray "restart" and recovery dialogs. Saves window state first, then spawns a
/// fresh instance (the old process exits immediately, releasing the mutex).
pub fn restart_application(app: &AppHandle) {
    save_state(app);
    log::warn!("BrowserHub restart requested (tray action)");
    relaunch_now();
}

/// Background watchdog. It intentionally does not call any Tauri API: Tauri
/// window accessors block on the UI thread and would freeze the watchdog too.
/// All checks use raw Win32 against the HWND captured at startup.
pub fn spawn_watchdog() {
    std::thread::spawn(move || {
        use std::time::{Duration, Instant};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            IsHungAppWindow, IsWindow, IsWindowVisible,
        };

        const TICK: Duration = Duration::from_secs(3);
        const QUICK_STRIKES: u32 = 10; // ~30s: UI hung and webview dead
        const SLOW_STRIKES: u32 = 30; // ~90s: UI busy but webview alive (long task)
        const DIALOG_COOLDOWN: Duration = Duration::from_secs(60);

        let mut strikes = 0u32;
        let mut ticks = 0u32;
        let mut last_dialog = Instant::now() - Duration::from_secs(120);

        loop {
            std::thread::sleep(TICK);
            ticks = ticks.wrapping_add(1);
            let Some(hwnd) = raw_main_hwnd() else {
                continue;
            };
            if unsafe { IsWindow(hwnd) } == 0 {
                continue;
            }

            if unsafe { IsHungAppWindow(hwnd) } == 0 {
                strikes = 0;

                // Blank-but-visible window: the UI thread still pumps, so the
                // tray works, but offer recovery for the dead renderer.
                if ticks % 4 == 0
                    && unsafe { IsWindowVisible(hwnd) } != 0
                    && last_dialog.elapsed() >= DIALOG_COOLDOWN
                    && !webview_health::is_webview_responsive(hwnd)
                {
                    last_dialog = Instant::now();
                    log::warn!("watchdog: webview is unresponsive while the window is visible");
                    match ask_recovery(
                        "BrowserHub 渲染进程无响应",
                        "WebView2 渲染进程无响应，界面可能显示为空白。",
                        true,
                    ) {
                        RecoveryChoice::Restart => relaunch_now(),
                        RecoveryChoice::Exit => {
                            log::warn!("watchdog: exit requested by user");
                            std::process::exit(0);
                        }
                        RecoveryChoice::Cancel => {}
                    }
                }
                continue;
            }

            strikes += 1;
            if strikes < QUICK_STRIKES {
                continue;
            }

            // Distinguish the zombie webview from a legitimate long UI task
            // (backup/import): when the webview still answers, wait much longer.
            let webview_alive = webview_health::is_webview_responsive(hwnd);
            let threshold = if webview_alive { SLOW_STRIKES } else { QUICK_STRIKES };
            if strikes < threshold || last_dialog.elapsed() < DIALOG_COOLDOWN {
                continue;
            }

            last_dialog = Instant::now();
            log::warn!(
                "watchdog: UI thread unresponsive for ~{}s (webview_alive={webview_alive})",
                strikes * 3
            );
            match ask_recovery(
                "BrowserHub 无响应",
                "BrowserHub 主线程长时间无响应，可能因为 WebView2 渲染进程崩溃。",
                true,
            ) {
                RecoveryChoice::Restart => relaunch_now(),
                RecoveryChoice::Exit => {
                    log::warn!("watchdog: exit requested by user");
                    std::process::exit(0);
                }
                RecoveryChoice::Cancel => {}
            }
            strikes = 0;
        }
    });
}
