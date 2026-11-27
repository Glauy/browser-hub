use tauri::menu::{ContextMenu, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    // Concise labels: the product name is already on the icon/tooltip; repeating
    // it on every row reads like a debug menu.
    let open = MenuItem::with_id(app, "open", "打开主窗口", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重新启动", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;

    // One separator groups the primary action apart from maintenance/exit.
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &separator, &restart, &exit])?;

    // Windows convention: the default item is drawn bold. Mark "open" (the
    // first row) as the default so the menu has a clear primary action.
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::SetMenuDefaultItem;
        if let Ok(hmenu) = menu.hpopupmenu() {
            unsafe {
                SetMenuDefaultItem(hmenu as usize as *mut core::ffi::c_void, 0, 1);
            }
        }
    }

    let mut builder = TrayIconBuilder::with_id("browserhub-tray")
        .tooltip("BrowserHub · Chrome 环境管理器\n左键打开主窗口　右键更多操作")
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
