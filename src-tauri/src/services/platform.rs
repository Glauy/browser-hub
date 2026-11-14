use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HWND,
};
use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    FindWindowW, IsIconic, MessageBoxW, SetForegroundWindow, ShowWindow, MB_ICONERROR, MB_OK,
    SW_RESTORE, SW_SHOW,
};

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

pub fn focus_existing_window() {
    let title = to_wide(OsStr::new("BrowserHub"));
    for _ in 0..12 {
        let window: HWND = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
        if !window.is_null() {
            unsafe {
                if IsIconic(window) != 0 {
                    ShowWindow(window, SW_RESTORE);
                } else {
                    ShowWindow(window, SW_SHOW);
                }
                SetForegroundWindow(window);
            }
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(120));
    }
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
            MB_OK | MB_ICONERROR,
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
