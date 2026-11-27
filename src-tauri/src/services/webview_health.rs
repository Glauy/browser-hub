//! WebView2 health probing.
//!
//! The WebView2 host windows (`Chrome_WidgetWin_1`,
//! `Chrome_RenderWidgetHostHWND`) are **children of the main window but owned by
//! `msedgewebview2.exe`**. Any synchronous window operation on the parent
//! (`ShowWindow`, `SetWindowPos`, `DestroyWindow`, ...) notifies those children
//! and therefore blocks until their owning thread processes the notification.
//!
//! When the WebView2 browser process crashes, Windows Error Reporting may leave
//! it frozen with every thread suspended instead of terminating it. In that
//! state `ShowWindow` never returns and the whole UI thread dies. This module
//! lets the caller detect that state *before* touching the window.

use windows_sys::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows_sys::Win32::System::Threading::{
    OpenThread, ResumeThread, SuspendThread, THREAD_SUSPEND_RESUME,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumChildWindows, GetClassNameW, GetWindowThreadProcessId, SendMessageTimeoutW, WM_NULL,
};

/// Long enough to ride out a busy frame, short enough not to freeze the caller.
const PROBE_TIMEOUT_MS: u32 = 1200;

/// Definitive zombie check: the WebView2 browser UI thread was suspended by
/// someone else (Windows Error Reporting freezes a crashed process to collect a
/// dump, then may leave it alive). BrowserHub never suspends its own webview, so
/// a non-zero suspend count means the webview can never recover.
pub fn is_webview_suspended(main: HWND) -> bool {
    let mut windows: Vec<HWND> = Vec::new();
    unsafe {
        EnumChildWindows(
            main,
            Some(collect_child),
            &mut windows as *mut Vec<HWND> as LPARAM,
        );
    }

    for hwnd in windows {
        if class_name(hwnd) != "Chrome_WidgetWin_1" {
            continue;
        }
        let mut pid = 0u32;
        let thread = unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if thread == 0 {
            continue;
        }
        let handle = unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, thread) };
        if handle.is_null() {
            continue;
        }
        // SuspendThread returns the previous count; immediately undo the probe
        // so the thread ends up exactly where it was (0 for a healthy webview,
        // >0 for a zombie).
        let previous = unsafe { SuspendThread(handle) };
        let suspended = previous != u32::MAX && previous > 0;
        unsafe {
            ResumeThread(handle);
            CloseHandle(handle);
        }
        if suspended {
            log::warn!("webview UI thread {thread} is suspended (pid {pid})");
            return true;
        }
    }

    false
}

/// `true` when every cross-process WebView2 host window answers within
/// [`PROBE_TIMEOUT_MS`]. A window that does not exist yet counts as healthy so
/// the startup path is not blocked by a false positive.
pub fn is_webview_responsive(main: HWND) -> bool {
    let mut windows: Vec<HWND> = Vec::new();
    unsafe {
        EnumChildWindows(
            main,
            Some(collect_child),
            &mut windows as *mut Vec<HWND> as LPARAM,
        );
    }

    for hwnd in windows {
        let class = class_name(hwnd);
        // Only the WebView2 browser UI thread windows. The GPU process also
        // owns a hidden "Intermediate D3D Window" that intentionally does not
        // pump messages; probing it would produce false negatives.
        if !matches!(
            class.as_str(),
            "Chrome_WidgetWin_1" | "Chrome_RenderWidgetHostHWND"
        ) {
            continue;
        }

        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let mut result = 0usize;
        let ok = unsafe {
            SendMessageTimeoutW(hwnd, WM_NULL, 0, 0, 0, PROBE_TIMEOUT_MS, &mut result)
        };
        if ok == 0 {
            log::warn!(
                "webview probe timed out: hwnd=0x{:X} class={} pid={}",
                hwnd as usize,
                class,
                pid
            );
            return false;
        }
    }

    true
}

unsafe extern "system" fn collect_child(hwnd: HWND, lparam: LPARAM) -> i32 {
    let windows = &mut *(lparam as *mut Vec<HWND>);
    windows.push(hwnd);
    1
}

fn class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 128];
    let length = unsafe { GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32) };
    if length <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..length as usize])
}
