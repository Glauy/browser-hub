use crate::errors::{AppError, AppResult};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub app_data_dir: PathBuf,
    pub database_path: PathBuf,
    pub config_path: PathBuf,
    pub logs_dir: PathBuf,
    pub temp_dir: PathBuf,
    pub window_state_path: PathBuf,
    /// WebView2 user-data folder, nested inside the data directory so the
    /// product owns exactly one top-level folder under %LOCALAPPDATA%.
    pub webview_data_dir: PathBuf,
}

impl AppPaths {
    pub fn resolve() -> AppResult<Self> {
        let local_app_data = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("USERPROFILE").map(|home| {
                    PathBuf::from(home)
                        .join("AppData")
                        .join("Local")
                })
            })
            .or_else(|| std::env::current_dir().ok())
            .ok_or_else(|| {
                AppError::new(
                    "APP_DATA_UNAVAILABLE",
                    "无法确定 BrowserHub 的应用数据目录。请检查当前用户的系统环境。",
                )
            })?;

        // Reverse-domain data directory: one folder per Forga product, matching
        // the WebView2 data dir (com.browserhub.desktop) and avoiding collisions
        // between products under %LOCALAPPDATA%.
        let app_data_dir = local_app_data.join("forga.space").join("BrowserHub");
        migrate_legacy_data_dir(&local_app_data, &app_data_dir);
        let paths = Self {
            database_path: app_data_dir.join("manager.db"),
            config_path: app_data_dir.join("config.json"),
            logs_dir: app_data_dir.join("logs"),
            temp_dir: app_data_dir.join("temp"),
            window_state_path: app_data_dir.join("window-state.json"),
            webview_data_dir: app_data_dir.join("webview"),
            app_data_dir,
        };
        paths.ensure_directories()?;
        Ok(paths)
    }

    pub fn ensure_directories(&self) -> AppResult<()> {
        for directory in [
            &self.app_data_dir,
            &self.logs_dir,
            &self.temp_dir,
            &self.webview_data_dir,
        ] {
            fs::create_dir_all(directory).map_err(|error| {
                AppError::io("无法创建 BrowserHub 应用数据目录", error)
            })?;
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn is_inside_app_data(&self, path: &Path) -> bool {
        is_same_or_descendant(path, &self.app_data_dir)
    }}

/// One-time migration: installations before the forga.space layout kept data in
/// `%LOCALAPPDATA%\BrowserHub`. If the new directory has no database yet and the
/// legacy one exists, move the whole legacy folder over. Only program leftovers
/// (exe/uninstaller from the very first NSIS layout) are dropped.
fn migrate_legacy_data_dir(local_app_data: &Path, new_dir: &Path) {
    let legacy = local_app_data.join("BrowserHub");
    if !legacy.exists() || new_dir.exists() {
        return;
    }
    let legacy_has_data = legacy.join("manager.db").is_file()
        || legacy.join("config.json").is_file();
    if !legacy_has_data {
        log::info!("legacy data dir {} has no metadata; leaving it untouched", legacy.display());
        return;
    }
    if let Some(parent) = new_dir.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            log::warn!("could not create {}: {error}", parent.display());
            return;
        }
    }
    match fs::rename(&legacy, new_dir) {
        Ok(()) => log::info!(
            "migrated legacy data dir {} -> {}",
            legacy.display(),
            new_dir.display()
        ),
        Err(error) => {
            // Cross-volume or locked: fall back to copy, then remove what moved.
            log::warn!("rename migration failed ({error}); trying copy");
            if copy_dir_recursive(&legacy, new_dir).is_ok() {
                let _ = fs::remove_dir_all(&legacy);
                log::info!("migrated legacy data dir by copy");
            } else {
                log::error!("legacy data migration failed; starting with empty data");
            }
        }
    }
}

fn copy_dir_recursive(source: &Path, target: &Path) -> std::io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let destination = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), &destination)?;
        }
    }
    Ok(())
}

/// Compares two paths without requiring either of them to exist.
pub fn normalize_path(path: &Path) -> String {
    let simplified = dunce::simplified(path);
    let mut value = simplified.to_string_lossy().replace('/', "\\");
    while value.len() > 3 && value.ends_with('\\') {
        value.pop();
    }
    value
}

pub fn normalized_key(path: &Path) -> String {
    normalize_path(path).to_lowercase()
}

pub fn paths_equal(left: &Path, right: &Path) -> bool {
    let left_canonical = dunce::canonicalize(left).ok();
    let right_canonical = dunce::canonicalize(right).ok();
    match (left_canonical, right_canonical) {
        (Some(left), Some(right)) => normalized_key(&left) == normalized_key(&right),
        _ => normalized_key(left) == normalized_key(right),
    }
}

pub fn is_same_or_descendant(candidate: &Path, ancestor: &Path) -> bool {
    let candidate = normalized_key(candidate);
    let ancestor = normalized_key(ancestor);
    if candidate == ancestor {
        return true;
    }
    let prefix = if ancestor.ends_with('\\') {
        ancestor
    } else {
        format!("{ancestor}\\")
    };
    candidate.starts_with(&prefix)
}

pub fn paths_overlap(left: &Path, right: &Path) -> bool {
    is_same_or_descendant(left, right) || is_same_or_descendant(right, left)
}

pub fn is_drive_root(path: &Path) -> bool {
    let normalized = normalize_path(path);
    normalized.len() == 3
        && normalized.as_bytes()[1] == b':'
        && normalized.as_bytes()[2] == b'\\'
}
