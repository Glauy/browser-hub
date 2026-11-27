use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开 BrowserHub", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重新启动 BrowserHub", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "退出 BrowserHub", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &restart, &exit])?;

    let mut builder = TrayIconBuilder::with_id("browserhub-tray")
        .tooltip("BrowserHub - Chrome 环境管理器\n左键：显示窗口\n右键：打开/重启/退出")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::window::show_main_window(app),
            "restart" => crate::window::restart_application(app),
            "exit" => crate::window::exit_application(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // Left click / double click always restores the window. This is
            // the primary interaction since closing/minimizing hides the
            // window to the tray (no taskbar entry while hidden).
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => crate::window::show_main_window(tray.app_handle()),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
