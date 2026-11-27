use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HWND, WAIT_OBJECT_0,
};
use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows_sys::Win32::System::Threading::{
    CreateEventW, CreateMutexW, OpenEventW, OpenProcess, QueryFullProcessImageNameW, SetEvent,
    TerminateProcess, WaitForSingleObject, EVENT_MODIFY_STATE, INFINITE,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, GetWindowThreadProcessId, IsHungAppWindow, IsIconic, MessageBoxW,
    SetForegroundWindow, ShowWindowAsync, IDCANCEL, IDNO, IDYES, MB_ICONERROR,
    MB_ICONWARNING, MB_OK, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNO, MB_YESNOCANCEL, SW_RESTORE,
    SW_SHOW,
};

/// windows-sys 0.61 does not expose a named `SYNCHRONIZE` constant.
const SYNCHRONIZE_ACCESS: u32 = 0x0010_0000;

/// Auto-reset event used to hand "show the window" requests from a second
/// process to the running instance's UI thread. Set by the second process,
/// waited on by a background thread in the first one.
const ACTIVATION_EVENT_NAME: &str = r"Local\BrowserHub.Desktop.Activate";
const RELAUNCH_ARG: &str = "--relaunch";

static ACTIVATION_EVENT: OnceLock<isize> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryChoice {
    Restart,
    Exit,
    Cancel,
}

pub fn to_wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

pub fn path_wide(path: &Path) -> Vec<u16> {
    to_wide(path.as_os_str())
}

pub fn from_wide_buffer(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

/// Named mutex based single-instance guard. Returns false when BrowserHub is
/// already running. The mutex handle intentionally lives for the process
/// lifetime; Windows releases it automatically on exit.
pub fn acquire_single_instance() -> bool {
    let name = to_wide(OsStr::new(r"Local\BrowserHub.Desktop.SingleInstance"));
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        log::warn!("single-instance mutex could not be created; continuing");
        return true;
    }
    let already_running = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
    if already_running {
        unsafe {
            CloseHandle(handle);
        }
        false
    } else {
        // Leaked on purpose: the OS closes it when the process exits.
        let _ = handle;
        true
    }
}

/// Relaunch path: the old process may still be shutting down for a moment, so
/// retry instead of treating it as "another instance is already running".
pub fn acquire_single_instance_wait(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if acquire_single_instance() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

pub fn is_relaunch_request() -> bool {
    std::env::args().any(|argument| argument == RELAUNCH_ARG)
}

/// Handles a second launch. Never calls a blocking window API from this
/// process: a hung first instance must not turn into a leaked second process.
pub fn focus_existing_window() {
    let Some(window) = find_main_window() else {
        return;
    };

    // Definitive crash signature: a suspended WebView2 never recovers. Restart
    // silently so double-clicking the shortcut "just works".
    if crate::services::webview_health::is_webview_suspended(window) {
        log::warn!("existing BrowserHub webview is suspended; restarting automatically");
        restart_existing_window(window);
        return;
    }

    if unsafe { IsHungAppWindow(window) } != 0 {
        log::warn!("existing BrowserHub window is not responding");
        if ask_recovery(
            "BrowserHub 已有实例无响应",
            "已有 BrowserHub 实例长时间无响应，可能因为 WebView2 渲染进程崩溃。",
            false,
        ) == RecoveryChoice::Restart
        {
            restart_existing_window(window);
        }
        return;
    }

    if !crate::services::webview_health::is_webview_responsive(window) {
        log::warn!("existing BrowserHub webview is not responding");
        if ask_recovery(
            "BrowserHub 渲染进程无响应",
            "已有 BrowserHub 实例的 WebView2 渲染进程无响应。",
            false,
        ) == RecoveryChoice::Restart
        {
            restart_existing_window(window);
        }
        return;
    }

    // Healthy: let the running instance run its own guarded show path on its UI
    // thread. If it predates this mechanism or the request cannot be
    // delivered, fall back to an asynchronous show (never blocks).
    if !signal_activation() {
        unsafe {
            if IsIconic(window) != 0 {
                ShowWindowAsync(window, SW_RESTORE);
            } else {
                ShowWindowAsync(window, SW_SHOW);
            }
            SetForegroundWindow(window);
        }
    }
}

fn find_main_window() -> Option<HWND> {
    let title = to_wide(OsStr::new("BrowserHub"));
    for _ in 0..12 {
        let window = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
        if !window.is_null() {
            return Some(window);
        }
        std::thread::sleep(Duration::from_millis(120));
    }
    None
}

fn restart_existing_window(window: HWND) {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    if pid == 0 {
        return;
    }
    if !is_our_executable(pid) {
        log::warn!("refusing to terminate pid {pid}: image path is not BrowserHub");
        return;
    }
    if !terminate_process(pid) {
        log::warn!("could not terminate unresponsive BrowserHub pid {pid}");
        return;
    }
    log::warn!("terminated unresponsive BrowserHub pid {pid}; relaunching");
    relaunch_now();
}

fn process_image_path(pid: u32) -> Option<PathBuf> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut buffer = [0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 {
        return None;
    }
    Some(PathBuf::from(String::from_utf16_lossy(
        &buffer[..size as usize],
    )))
}

fn is_our_executable(pid: u32) -> bool {
    let Some(other) = process_image_path(pid) else {
        return false;
    };
    let Ok(current) = std::env::current_exe() else {
        return false;
    };
    let (Ok(other), Ok(current)) = (
        dunce::canonicalize(other),
        dunce::canonicalize(current),
    ) else {
        return false;
    };
    other
        .to_string_lossy()
        .eq_ignore_ascii_case(&current.to_string_lossy())
}

fn terminate_process(pid: u32) -> bool {
    let handle = unsafe { OpenProcess(PROCESS_TERMINATE | SYNCHRONIZE_ACCESS, 0, pid) };
    if handle.is_null() {
        log::warn!(
            "could not open BrowserHub pid {pid} for termination: {}",
            unsafe { GetLastError() }
        );
        return false;
    }
    let ok = unsafe { TerminateProcess(handle, 1) } != 0;
    if ok {
        unsafe {
            WaitForSingleObject(handle, 5_000);
        }
    }
    unsafe {
        CloseHandle(handle);
    }
    ok
}

/// Spawns a fresh BrowserHub and terminates this process immediately. Safe for
/// Chrome: only the UI process is replaced, environments keep running.
pub fn relaunch_now() -> ! {
    log::warn!("restarting BrowserHub");
    if let Ok(executable) = std::env::current_exe() {
        match std::process::Command::new(&executable).arg(RELAUNCH_ARG).spawn() {
            Ok(_) => log::warn!("spawned relaunch process: {}", executable.display()),
            Err(error) => log::error!("could not spawn relaunch process: {error}"),
        }
    }
    std::process::exit(0);
}

/// Native recovery dialog. `allow_exit` adds the "exit without restarting"
/// choice (three buttons); otherwise only "restart" / "cancel" are offered.
pub fn ask_recovery(title: &str, message: &str, allow_exit: bool) -> RecoveryChoice {
    let title_wide = wide(title);
    let body = if allow_exit {
        format!(
            "{message}\n\n是：重启 BrowserHub（推荐）\n否：直接退出 BrowserHub\n取消：继续等待\n\nChrome 环境不会受到影响。"
        )
    } else {
        format!(
            "{message}\n\n是：结束旧实例并重新启动\n否：取消\n\nChrome 环境不会受到影响。"
        )
    };
    let body_wide = wide(&body);
    let style = (if allow_exit { MB_YESNOCANCEL } else { MB_YESNO })
        | MB_ICONWARNING
        | MB_TOPMOST
        | MB_SETFOREGROUND;
    let result = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body_wide.as_ptr(),
            title_wide.as_ptr(),
            style,
        )
    };
    match result {
        IDYES => RecoveryChoice::Restart,
        IDNO if allow_exit => RecoveryChoice::Exit,
        IDCANCEL | IDNO => RecoveryChoice::Cancel,
        _ => RecoveryChoice::Cancel,
    }
}

/// Creates the activation event and listens on a background thread. The
/// callback is marshalled onto the Tauri main thread, so it runs through the
/// same guarded `show_main_window` path as a tray click.
pub fn spawn_activation_listener(app: tauri::AppHandle) {
    let name = to_wide(OsStr::new(ACTIVATION_EVENT_NAME));
    let handle = unsafe { CreateEventW(std::ptr::null(), 0, 0, name.as_ptr()) };
    if handle.is_null() {
        log::warn!(
            "could not create activation event: {}",
            unsafe { GetLastError() }
        );
        return;
    }
    let raw = handle as isize;
    let _ = ACTIVATION_EVENT.set(raw);

    std::thread::spawn(move || {
        let handle = raw as HANDLE;
        loop {
            let result = unsafe { WaitForSingleObject(handle, INFINITE) };
            if result != WAIT_OBJECT_0 {
                continue;
            }
            let app = app.clone();
            let handle = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                crate::window::show_main_window(&handle);
            }) {
                log::warn!("could not dispatch activation to the main thread: {error}");
            }
        }
    });
}

fn signal_activation() -> bool {
    let name = to_wide(OsStr::new(ACTIVATION_EVENT_NAME));
    let handle = unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr()) };
    if handle.is_null() {
        return false;
    }
    let ok = unsafe { SetEvent(handle) } != 0;
    unsafe {
        CloseHandle(handle);
    }
    ok
}

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn show_native_error(title: &str, message: &str) {
    let title = wide(title);
    let message = wide(message);
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR | MB_TOPMOST,
        );
    }
}

/// Opens a directory in Explorer. If `path` points to a file, its parent
/// directory is opened instead.
pub fn open_in_explorer(path: &Path) -> Result<(), String> {
    let target = if path.is_file() {
        path.parent().ok_or_else(|| "路径没有上级目录".to_string())?
    } else {
        path
    };
    if !target.exists() {
        return Err("目录不存在".to_string());
    }

    let operation = wide("open");
    let target_wide = path_wide(target);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
        )
    };
    let code = result as isize;
    if code > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecuteW returned {code}"))
    }
}

pub fn disk_space(path: &Path) -> Option<(u64, u64)> {
    let path = path_wide(path);
    let mut available = 0u64;
    let mut total = 0u64;
    let success = unsafe {
        GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut available,
            &mut total,
            std::ptr::null_mut(),
        )
    };
    if success != 0 {
        Some((available, total))
    } else {
        None
    }
}

pub fn apply_autostart(enabled: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const VALUE_NAME: &str = "BrowserHub";

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if enabled {
        let executable = std::env::current_exe()
            .map_err(|error| format!("无法获取当前程序路径: {error}"))?;
        let command = format!("\"{}\"", executable.display());
        let (key, _) = hkcu
            .create_subkey(RUN_KEY)
            .map_err(|error| error.to_string())?;
        key.set_value(VALUE_NAME, &command)
            .map_err(|error| error.to_string())?;
    } else {
        match hkcu.open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE) {
            Ok(key) => match key.delete_value(VALUE_NAME) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.to_string()),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

/// Windows reparse points (junctions and symlinks) must not be treated as
/// ordinary environment folders for destructive operations.
pub fn is_reparse_point(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    std::fs::symlink_metadata(path)
        .map(|metadata| metadata.file_attributes() & 0x400 != 0)
        .unwrap_or(false)
}
