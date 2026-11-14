use crate::errors::{AppError, AppResult};
use crate::models::DetectedChrome;
use crate::services::app_paths::{normalize_path, normalized_key};
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use windows_sys::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW,
};
use winreg::enums::{
    HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
};
use winreg::RegKey;

fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(std::iter::once(0)).collect()
}

fn env_path(variable: &str) -> Option<PathBuf> {
    std::env::var_os(variable)
        .map(PathBuf::from)
        .filter(|value| !value.as_os_str().is_empty())
}

fn application_candidates() -> Vec<(PathBuf, &'static str)> {
    let mut candidates = Vec::new();
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(base) = env_path(variable) {
            candidates.push((
                base.join("Google")
                    .join("Chrome")
                    .join("Application")
                    .join("chrome.exe"),
                "常见安装位置",
            ));
        }
    }
    if let Some(local) = env_path("LOCALAPPDATA") {
        candidates.push((
            local
                .join("Google")
                .join("Chrome")
                .join("Application")
                .join("chrome.exe"),
            "当前用户安装",
        ));
    }
    candidates
}

fn read_registry_string(
    root: winreg::HKEY,
    subkey: &str,
    value: &str,
    view: u32,
) -> Option<String> {
    let key = RegKey::predef(root);
    let opened = key
        .open_subkey_with_flags(subkey, KEY_READ | view)
        .or_else(|_| key.open_subkey_with_flags(subkey, KEY_READ))
        .ok()?;
    let text: String = opened.get_value(value).ok()?;
    let trimmed = text.trim().trim_matches('"').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn registry_app_paths() -> Vec<(PathBuf, &'static str)> {
    let mut result = Vec::new();
    for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            for subkey in [
                r"Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
                r"Software\Microsoft\Windows\CurrentVersion\App Paths\Chrome.exe",
            ] {
                if let Some(value) = read_registry_string(root, subkey, "", view) {
                    result.push((PathBuf::from(value), "注册表 App Paths"));
                }
            }
        }
    }
    result
}

fn registry_beacon_version() -> Option<String> {
    for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
        for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
            if let Some(version) =
                read_registry_string(root, r"Software\Google\Chrome\BLBeacon", "version", view)
            {
                let cleaned = version.trim();
                if !cleaned.is_empty()
                    && cleaned
                        .chars()
                        .all(|character| character.is_ascii_digit() || character == '.')
                {
                    return Some(cleaned.to_string());
                }
            }
        }
    }
    None
}

pub fn validate_chrome_executable(raw_path: &str) -> AppResult<PathBuf> {
    let trimmed = raw_path.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err(AppError::new(
            "CHROME_PATH_INVALID",
            "请选择 Chrome 的可执行文件（chrome.exe）。",
        ));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new(
            "CHROME_PATH_INVALID",
            "Chrome 路径必须是完整的绝对路径。",
        ));
    }
    let is_chrome_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("chrome.exe"))
        .unwrap_or(false);
    if !is_chrome_name {
        return Err(AppError::new(
            "CHROME_PATH_INVALID",
            "请选择名为 chrome.exe 的文件。",
        ));
    }
    let metadata = std::fs::metadata(&path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => AppError::new(
            "CHROME_PATH_INVALID",
            "指定的 Chrome 文件不存在，请重新选择。",
        ),
        _ => AppError::new(
            "CHROME_PATH_INVALID",
            "无法访问指定的 Chrome 文件，请检查权限。",
        ),
    })?;
    if !metadata.is_file() {
        return Err(AppError::new(
            "CHROME_PATH_INVALID",
            "指定的路径不是 chrome.exe 文件。",
        ));
    }
    Ok(dunce::canonicalize(&path).unwrap_or(path))
}

/// Reads the Windows file version resource of chrome.exe.
pub fn file_version(path: &Path) -> Option<String> {
    let path_wide = wide(path.as_os_str());
    let mut handle = 0u32;
    let size = unsafe { GetFileVersionInfoSizeW(path_wide.as_ptr(), &mut handle) };
    if size == 0 {
        return None;
    }
    let mut buffer = vec![0u8; size as usize];
    let ok = unsafe {
        GetFileVersionInfoW(
            path_wide.as_ptr(),
            0,
            size,
            buffer.as_mut_ptr() as *mut std::ffi::c_void,
        )
    };
    if ok == 0 {
        return None;
    }

    let sub_block = wide(OsStr::new("\\"));
    let mut pointer: *mut std::ffi::c_void = std::ptr::null_mut();
    let mut length = 0u32;
    let ok = unsafe {
        VerQueryValueW(
            buffer.as_ptr() as *const std::ffi::c_void,
            sub_block.as_ptr(),
            &mut pointer,
            &mut length,
        )
    };
    if ok == 0 || pointer.is_null() {
        return None;
    }
    let info = unsafe { std::slice::from_raw_parts(pointer as *const u32, 4) };
    let file_version_ms = info[2];
    let file_version_ls = info[3];
    let major = file_version_ms >> 16;
    let minor = file_version_ms & 0xffff;
    let build = file_version_ls >> 16;
    let revision = file_version_ls & 0xffff;
    if major == 0 && minor == 0 && build == 0 {
        None
    } else {
        Some(format!("{major}.{minor}.{build}.{revision}"))
    }
}

fn version_from_install_directory(executable: &Path) -> Option<String> {
    let application = executable.parent()?;
    let mut best: Option<(Vec<u64>, String)> = None;
    for entry in std::fs::read_dir(application).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let parts: Vec<u64> = match name
            .split('.')
            .map(|part| part.parse::<u64>())
            .collect::<Result<_, _>>()
        {
            Ok(parts) => parts,
            Err(_) => continue,
        };
        if parts.len() < 3 {
            continue;
        }
        if !entry.path().is_dir() {
            continue;
        }
        let version_dir = entry.path().join("chrome.exe");
        if !version_dir.is_file() {
            continue;
        }
        match &best {
            Some((best_parts, _)) if best_parts >= &parts => {}
            _ => best = Some((parts, name)),
        }
    }
    best.map(|(_, value)| value)
}

pub fn executable_version(path: &Path) -> Option<String> {
    file_version(path)
        .or_else(|| version_from_install_directory(path))
        .or_else(registry_beacon_version)
}

/// Detects Chrome installations from common directories and the registry.
/// Results are de-duplicated by path and stable-ordered.
pub fn detect() -> Vec<DetectedChrome> {
    let mut seen = std::collections::HashSet::new();
    let mut found = Vec::new();

    let mut sources = application_candidates();
    sources.extend(registry_app_paths());

    for (path, source) in sources {
        if !path.is_file() {
            continue;
        }
        let canonical = dunce::canonicalize(&path).unwrap_or(path);
        let key = normalized_key(&canonical);
        if !seen.insert(key) {
            continue;
        }
        let version = executable_version(&canonical);
        found.push(DetectedChrome {
            executable_path: normalize_path(&canonical),
            version,
            source: source.to_string(),
        });
    }

    found
}

#[allow(dead_code)]
pub fn detect_first() -> Option<DetectedChrome> {
    detect().into_iter().next()
}
