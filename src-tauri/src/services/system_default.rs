use crate::errors::{AppError, AppResult};
use crate::services::{platform, process};
use crate::state::AppState;
use std::path::{Path, PathBuf};

/// Chrome's per-user default data directory (what the plain Chrome shortcut
/// opens when launched without `--user-data-dir`).
pub fn chrome_default_user_data_dir() -> PathBuf {
    let local = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var_os("USERPROFILE")
                .map(PathBuf::from)
                .expect("USERPROFILE unavailable");
            home.join("AppData").join("Local")
        });
    local
        .join("Google")
        .join("Chrome")
        .join("User Data")
}

/// The managed default profile directory: a first-class sibling of env_* dirs.
/// Model (see docs/app-data-vs-webview.md):
///   - one engine (chrome.exe), many user-data folders
///   - `env_default` hosts the SYSTEM default Chrome (the plain shortcut)
///   - `env_<id>` dirs host BrowserHub environments (launched with explicit
///     --user-data-dir, freely parallel)
/// The takeover is a fixed junction User Data -> env_default. There is no
/// "switching": env_default IS the default, permanently.
pub fn default_profile_dir() -> PathBuf {
    PathBuf::from(crate::models::join_windows(
        crate::models::DEFAULT_ENVIRONMENT_ROOT,
        "env_default",
    ))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDefaultState {
    /// Does `User Data` exist?
    pub exists: bool,
    /// Is `User Data` a junction pointing at env_default (managed)?
    pub is_managed: bool,
    /// The junction target (raw).
    pub link_target: Option<String>,
    /// True when User Data is a plain directory (Chrome's own data, not yet
    /// managed; the original content is preserved at original_backup_path).
    pub is_original_real_dir: bool,
    /// Where the original Chrome data was saved during takeover, if any.
    pub original_backup_path: Option<String>,
    /// Does the managed env_default directory exist with content?
    pub default_profile_dir_exists: bool,
    /// Is a plain (no-args) Chrome currently running against User Data?
    pub default_chrome_running: bool,
}

const ORIGINAL_BACKUP_NAME: &str = "User Data.account0.bak";

fn original_backup_path() -> PathBuf {
    chrome_default_user_data_dir()
        .parent()
        .map(|parent| parent.join(ORIGINAL_BACKUP_NAME))
        .expect("default dir has a parent")
}

fn junction_target(dir: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_SHARE_READ,
        OPEN_EXISTING,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;
    use windows_sys::Win32::System::Ioctl::FSCTL_GET_REPARSE_POINT;

    const MAX_REPARSE: usize = 16 * 1024;

    let wide: Vec<u16> = dir
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let handle: HANDLE = unsafe {
        CreateFileW(
            wide.as_ptr(),
            0, // no access needed; only device query
            FILE_SHARE_READ,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, // open the link itself
            std::ptr::null_mut(),
        )
    };
    if handle.is_null() || handle == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
        return None;
    }

    let mut buffer = [0u8; MAX_REPARSE];
    let mut bytes_returned: u32 = 0;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            FSCTL_GET_REPARSE_POINT,
            std::ptr::null(),
            0,
            buffer.as_mut_ptr() as *mut std::ffi::c_void,
            MAX_REPARSE as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 {
        return None;
    }

    // ReparseDataBuffer: Tag(4) + DataLength(2) + Reserved(2) = 8 bytes, then
    // MOUNT_POINT_REPARSE_BUFFER (8 bytes) followed by PathBuffer[].
    // substOffset is relative to PathBuffer, which starts at byte 16.
    let subst_offset = u16::from_le_bytes([buffer[8], buffer[9]]) as usize;
    let subst_length = u16::from_le_bytes([buffer[10], buffer[11]]) as usize;
    let name_start = 16 + subst_offset;
    if name_start + subst_length > buffer.len() {
        return None;
    }
    let units: Vec<u16> = buffer[name_start..name_start + subst_length]
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    let value = String::from_utf16_lossy(&units)
        .trim_end_matches('\0')
        .to_string();
    let value = value.strip_prefix(r"\??\").unwrap_or(&value).to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

/// Is a plain (no --user-data-dir) Chrome instance running? Its engine would
/// be writing into User Data through the link; re-pointing mid-flight is unsafe.
fn default_chrome_running() -> AppResult<bool> {
    let processes = process::scan_chrome_processes().map_err(|reason| {
        AppError::with_detail(
            "SYSTEM_DEFAULT_CHECK_FAILED",
            "无法枚举 Chrome 进程，已取消操作。",
            reason,
        )
    })?;
    Ok(processes
        .iter()
        .any(|p| p.user_data_dir.is_none() && p.command_line.is_some()))
}

/// Live status of the default Chrome instance for the list row.
/// Running  = a plain chrome.exe (no --user-data-dir) exists.
/// Stopped  = managed dir exists, no plain instance.
/// Unknown  = process scan failed.
fn default_profile_status() -> crate::models::EnvironmentStatus {
    match process::scan_chrome_processes() {
        Ok(processes) => {
            if processes
                .iter()
                .any(|p| p.user_data_dir.is_none() && p.command_line.is_some())
            {
                crate::models::EnvironmentStatus::Running
            } else {
                crate::models::EnvironmentStatus::Stopped
            }
        }
        Err(_) => crate::models::EnvironmentStatus::Unknown,
    }
}

/// Row model for the special "系统默认 Chrome" entry in the environments list.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDefaultRow {
    pub managed: bool,
    pub user_data_dir: String,
    pub status: crate::models::EnvironmentStatus,
    pub size_bytes: u64,
    pub file_count: u64,
    pub default_chrome_running: bool,
    pub original_backup_path: Option<String>,
}

pub fn read_system_default_row(state: &AppState) -> AppResult<SystemDefaultRow> {
    let state_info = read_state(state);
    let managed_dir = default_profile_dir();
    let status = if state_info.is_managed {
        default_profile_status()
    } else {
        crate::models::EnvironmentStatus::Unknown
    };
    let (size_bytes, file_count) = if managed_dir.is_dir() {
        crate::services::filesystem::directory_stats(&managed_dir).unwrap_or((0, 0))
    } else {
        (0, 0)
    };
    Ok(SystemDefaultRow {
        managed: state_info.is_managed,
        user_data_dir: crate::services::app_paths::normalize_path(&managed_dir),
        status,
        size_bytes,
        file_count,
        default_chrome_running: state_info.default_chrome_running,
        original_backup_path: state_info.original_backup_path,
    })
}

/// Launch the default Chrome the same way the plain shortcut does: start
/// chrome.exe WITHOUT --user-data-dir so it resolves the junction to
/// env_default. Refuses when already running (Chrome would just focus the
/// existing instance and the status stays consistent).
pub fn launch_default_chrome(state: &AppState) -> AppResult<u32> {
    let _ = state;
    if default_chrome_running()? {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_CHROME_RUNNING",
            "默认 Chrome 已在运行。可直接切换到它的窗口，或关闭后再启动新实例。",
        ));
    }
    let executable = crate::services::chrome::validate_chrome_executable(
        &state
            .with_database(|db| crate::database::browsers::find_default(db))?
            .ok_or_else(|| {
                AppError::new(
                    crate::errors::CHROME_NOT_FOUND,
                    "尚未配置 Chrome，请先在设置中选择 chrome.exe。",
                )
            })?
            .executable_path,
    )?;
    let mut child = std::process::Command::new(&executable)
        .spawn()
        .map_err(|error| {
            AppError::with_detail(
                "LAUNCH_FAILED",
                "无法启动默认 Chrome。",
                format!("spawn {}: {error}", executable.display()),
            )
        })?;
    let pid = child.id();
    log::info!("launched default chrome (pid {pid}) without --user-data-dir");
    Ok(pid)
}

pub fn read_state(state: &AppState) -> SystemDefaultState {
    let _ = state;
    let user_data = chrome_default_user_data_dir();
    let exists = user_data.exists();
    let is_link = platform::is_reparse_point(&user_data);
    let link_target = if is_link {
        junction_target(&user_data)
    } else {
        None
    };
    let managed = link_target
        .as_deref()
        .map(|target| {
            crate::services::app_paths::paths_equal(Path::new(target), &default_profile_dir())
        })
        .unwrap_or(false);
    let backup = original_backup_path();
    SystemDefaultState {
        exists,
        is_managed: managed,
        link_target: link_target.clone(),
        is_original_real_dir: exists && !is_link,
        original_backup_path: if backup.exists() {
            Some(crate::services::app_paths::normalize_path(&backup))
        } else {
            None
        },
        default_profile_dir_exists: default_profile_dir().is_dir(),
        default_chrome_running: default_chrome_running().unwrap_or(false),
    }
}

fn create_junction(link: &Path, target: &Path) -> AppResult<()> {
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| AppError::io("无法创建链接的父目录", error))?;
    }
    let script = format!(
        "mklink /J \"{}\" \"{}\"",
        link.display(),
        target.display()
    );
    let output = std::process::Command::new("cmd")
        .args(["/C", &script])
        .creation_flags_no_window()
        .output()
        .map_err(|error| AppError::io("无法执行 mklink", error))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::with_detail(
            "SYSTEM_DEFAULT_TAKEOVER_FAILED",
            "创建目录联接失败。",
            stderr.trim().to_string(),
        ));
    }
    if !platform::is_reparse_point(link) {
        return Err(AppError::with_detail(
            "SYSTEM_DEFAULT_TAKEOVER_FAILED",
            "目录联接创建后未生效。",
            format!("{} did not become a reparse point", link.display()),
        ));
    }
    Ok(())
}

trait CreationFlags {
    fn creation_flags_no_window(&mut self) -> &mut Self;
}
impl CreationFlags for std::process::Command {
    fn creation_flags_no_window(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW
            self.creation_flags(0x0800_0000);
        }
        self
    }
}

/// Take over the system default Chrome: create/ensure the managed
/// `env_default` directory, then point `User Data` at it (fixed junction).
///
/// - If `User Data` is a real Chrome data dir, it is preserved at
///   `User Data.account0.bak` (restore brings it back).
/// - If `env_default` is empty/missing, the current `User Data` content (via
///   the real dir, before renaming) is NOT auto-copied: use the explicit
///   "sync" command which copies data into env_default first.
pub fn take_over(state: &AppState) -> AppResult<String> {
    let _ = state;
    if default_chrome_running()? {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_CHROME_RUNNING",
            "检测到默认 Chrome 正在运行。请先关闭所有不带环境参数的 Chrome 窗口再操作。",
        ));
    }

    let user_data = chrome_default_user_data_dir();
    let managed_dir = default_profile_dir();

    // Ensure the managed directory exists (empty is fine; user may sync later).
    std::fs::create_dir_all(&managed_dir)
        .map_err(|error| AppError::io("无法创建默认用户数据目录 env_default", error))?;
    if platform::is_reparse_point(&managed_dir) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "env_default 目录本身是链接，不能作为接管目标。",
        ));
    }

    let backup = original_backup_path();
    if platform::is_reparse_point(&user_data) {
        let target = junction_target(&user_data);
        let already = target
            .as_deref()
            .map(|t| {
                crate::services::app_paths::paths_equal(Path::new(t), &managed_dir)
            })
            .unwrap_or(false);
        if already {
            return Ok(crate::services::app_paths::normalize_path(&managed_dir));
        }
        // Points somewhere else: replace the link.
        if user_data.exists() {
            std::fs::remove_dir(&user_data)
                .map_err(|error| AppError::io("无法移除旧联接", error))?;
        }
    } else if user_data.exists() {
        if backup.exists() {
            return Err(AppError::new(
                "SYSTEM_DEFAULT_BACKUP_EXISTS",
                "已存在此前接管时的备份目录。请先处理它（恢复或确认丢弃）再重新接管。",
            ));
        }
        std::fs::rename(&user_data, &backup).map_err(|error| {
            AppError::io("无法将原系统默认 Chrome 数据移至备份位置", error)
        })?;
        log::info!("original chrome data moved to {}", backup.display());
    }

    create_junction(&user_data, &managed_dir)?;
    log::info!(
        "system default chrome managed: {} -> {}",
        user_data.display(),
        managed_dir.display()
    );
    Ok(crate::services::app_paths::normalize_path(&managed_dir))
}

/// Copy the current `User Data` content into the managed env_default dir.
/// Used when the user wants the existing default profile (logins, bookmarks)
/// to continue inside the managed directory. Skips nothing; refuses when
/// env_default already looks like a Chrome profile (Local State present).
pub fn sync_default_profile_data(state: &AppState) -> AppResult<(u64, u64)> {
    let _ = state;
    let user_data = chrome_default_user_data_dir();
    let managed_dir = default_profile_dir();

    if !user_data.exists() {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_NOT_TAKEN_OVER",
            "系统默认 Chrome 目录不存在，没有可同步的数据。",
        ));
    }
    if platform::is_reparse_point(&user_data) {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_ALREADY_LINKED",
            "User Data 已是链接，其内容即 env_default，无需同步。",
        ));
    }
    if managed_dir.join("Local State").exists() {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_SYNC_CONFLICT",
            "env_default 已包含 Chrome 数据（存在 Local State），避免覆盖请先手动处理。",
        ));
    }
    if default_chrome_running()? {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_CHROME_RUNNING",
            "检测到默认 Chrome 正在运行，请先关闭再同步。",
        ));
    }

    let source = &user_data;
    let target = &managed_dir;
    let mut total_files: u64 = 0;
    let mut total_bytes: u64 = 0;
    for entry in walkdir::WalkDir::new(source).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("sync skipped an entry: {error}");
                continue;
            }
        };
        if entry.depth() == 0 {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| AppError::internal("同步时无法计算相对路径", error.to_string()))?;
        let destination = target.join(relative);
        let file_type = entry.file_type();
        if file_type.is_dir() {
            std::fs::create_dir_all(&destination)
                .map_err(|error| AppError::io("同步时无法创建子目录", error))?;
        } else if file_type.is_file() {
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|error| AppError::io("同步时无法创建子目录", error))?;
            }
            std::fs::copy(entry.path(), &destination)
                .map_err(|error| AppError::io("同步时无法复制文件", error))?;
            total_files += 1;
            total_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    log::info!(
        "default profile synced: {} files, {} bytes -> {}",
        total_files,
        total_bytes,
        target.display()
    );
    Ok((total_files, total_bytes))
}

/// Restore the pre-takeover state: remove the fixed junction and bring back
/// the original Chrome data directory (or create a fresh empty one).
pub fn restore(_state: &AppState) -> AppResult<()> {
    if default_chrome_running()? {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_CHROME_RUNNING",
            "检测到默认 Chrome 正在运行。请先关闭所有不带环境参数的 Chrome 窗口再操作。",
        ));
    }
    let user_data = chrome_default_user_data_dir();
    let backup = original_backup_path();

    if !platform::is_reparse_point(&user_data) {
        return Err(AppError::new(
            "SYSTEM_DEFAULT_NOT_TAKEN_OVER",
            "系统默认 Chrome 目录当前不是链接，无需恢复。",
        ));
    }
    if user_data.exists() {
        std::fs::remove_dir(&user_data)
            .map_err(|error| AppError::io("无法移除接管联接", error))?;
    }
    if backup.exists() {
        std::fs::rename(&backup, &user_data).map_err(|error| {
            AppError::io("无法还原原始系统默认 Chrome 数据", error)
        })?;
        log::info!("original chrome data restored from {}", backup.display());
    } else {
        std::fs::create_dir_all(&user_data)
            .map_err(|error| AppError::io("无法重建空的默认 Chrome 目录", error))?;
        log::info!("no backup existed; created fresh default chrome dir");
    }
    Ok(())
}
