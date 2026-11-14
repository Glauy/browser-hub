use crate::errors::{AppError, AppResult};
use crate::models::DirectoryInspection;
use crate::services::app_paths::{normalize_path, normalized_key};
use crate::services::platform;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const WRITE_PROBE_PREFIX: &str = ".browserhub-write-test-";

/// Returns true for Chrome's per-profile child directories ("Default",
/// "Profile 1", ...). Those are not valid User Data Directories.
pub fn is_profile_directory_name(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.eq_ignore_ascii_case("default") {
        return true;
    }
    let lower = trimmed.to_ascii_lowercase();
    lower
        .strip_prefix("profile ")
        .or_else(|| lower.strip_prefix("profile"))
        .map(|rest| !rest.is_empty() && rest.chars().all(|character| character.is_ascii_digit()))
        .unwrap_or(false)
}

pub fn count_profiles(path: &Path) -> u32 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_dir())
                .unwrap_or(false)
                && entry
                    .file_name()
                    .to_str()
                    .map(is_profile_directory_name)
                    .unwrap_or(false)
        })
        .count() as u32
}

pub fn has_local_state(path: &Path) -> bool {
    path.join("Local State").is_file()
}

pub fn looks_like_chrome_user_data_dir(path: &Path) -> bool {
    has_local_state(path) || count_profiles(path) > 0
}

pub fn inspect_directory(
    path: &Path,
    managed_directories: &[String],
) -> AppResult<DirectoryInspection> {
    let normalized = normalize_path(path);
    let metadata = fs::metadata(path).ok();
    let exists = metadata.is_some();
    let is_directory = metadata.as_ref().map(|value| value.is_dir()).unwrap_or(false);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let is_profile_directory = is_directory && is_profile_directory_name(name);
    let suggested_user_data_dir = if is_profile_directory {
        path.parent().map(normalize_path)
    } else {
        None
    };
    let already_managed = managed_directories
        .iter()
        .any(|managed| normalized_key(Path::new(managed)) == normalized_key(path));
    let writable = if is_directory {
        can_write_directory(path)
    } else {
        false
    };
    let profile_count = if is_directory {
        count_profiles(path)
    } else {
        0
    };
    let is_chrome_user_data_dir = is_directory && looks_like_chrome_user_data_dir(path);
    let free_bytes = platform::disk_space(path)
        .or_else(|| {
            path.ancestors()
                .skip(1)
                .find(|ancestor| ancestor.exists())
                .and_then(platform::disk_space)
        })
        .map(|(available, _)| available);

    let message = if !exists {
        Some("目录不存在，请确认磁盘已连接或重新选择。".to_string())
    } else if !is_directory {
        Some("选择的路径不是文件夹。".to_string())
    } else if is_profile_directory {
        Some("这是 Chrome 的 Profile 子目录，请选择它的上一级 User Data Directory。".to_string())
    } else if already_managed {
        Some("该目录已经在一个浏览器环境中使用。".to_string())
    } else if !writable {
        Some("当前用户没有写入该目录的权限。".to_string())
    } else if !is_chrome_user_data_dir {
        Some("目录中没有发现 Local State 或 Profile 子目录，可能不是 Chrome 用户数据目录。".to_string())
    } else {
        None
    };

    Ok(DirectoryInspection {
        path: normalized,
        exists,
        is_directory,
        writable,
        is_chrome_user_data_dir,
        is_profile_directory,
        suggested_user_data_dir,
        profile_count,
        already_managed,
        free_bytes,
        message,
    })
}

pub fn can_write_directory(path: &Path) -> bool {
    let probe = path.join(format!(
        "{WRITE_PROBE_PREFIX}{}-{:x}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    ));
    match fs::File::create(&probe) {
        Ok(mut file) => {
            let _ = file.write_all(b"browserhub");
            drop(file);
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Creates the directory (and parents) and verifies that it is writable.
pub fn prepare_directory(path: &Path) -> AppResult<()> {
    if path.exists() && !path.is_dir() {
        return Err(AppError::new(
            "VALIDATION_FAILED",
            "目标位置不是文件夹，请重新选择。",
        ));
    }
    fs::create_dir_all(path).map_err(|error| AppError::io("无法创建目录", error))?;
    if !can_write_directory(path) {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "该目录不可写，请选择有写入权限的位置。",
        ));
    }
    Ok(())
}

pub fn directory_stats(path: &Path) -> AppResult<(u64, u64)> {
    if !path.is_dir() {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_NOT_FOUND",
            "环境目录不存在，可能已被移动或删除。",
        ));
    }
    let mut size = 0u64;
    let mut files = 0u64;
    for entry in walkdir::WalkDir::new(path).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("directory scan skipped an entry in {}: {error}", path.display());
                continue;
            }
        };
        if !entry.file_type().is_file() {
            continue;
        }
        if let Ok(metadata) = entry.metadata() {
            size = size.saturating_add(metadata.len());
            files += 1;
        }
    }
    Ok((size, files))
}

/// Copies a directory tree without following links or junctions. Browser
/// backups are byte copies; no Chrome files are parsed or logged.
pub fn copy_tree(source: &Path, target: &Path) -> AppResult<()> {
    if target.exists() {
        return Err(AppError::new(
            "VALIDATION_FAILED",
            "目标目录已经存在，请重新选择备份位置。",
        ));
    }
    fs::create_dir_all(target).map_err(|error| AppError::io("无法创建备份目录", error))?;

    for entry in walkdir::WalkDir::new(source)
        .follow_links(false)
        .into_iter()
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                return Err(AppError::with_detail(
                    "BACKUP_FAILED",
                    "备份过程中无法读取某个文件夹。请确认没有程序正在使用该环境。",
                    error.to_string(),
                ));
            }
        };
        if entry.depth() == 0 {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| AppError::internal("无法计算备份相对路径", error.to_string()))?;
        let destination = target.join(relative);
        let file_type = entry.file_type();
        if file_type.is_symlink() || platform::is_reparse_point(entry.path()) {
            log::warn!(
                "backup skipped reparse point {}",
                entry.path().display()
            );
            continue;
        }
        if file_type.is_dir() {
            fs::create_dir_all(&destination)
                .map_err(|error| AppError::io("无法创建备份子目录", error))?;
        } else if file_type.is_file() {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| AppError::io("无法创建备份子目录", error))?;
            }
            fs::copy(entry.path(), &destination)
                .map_err(|error| AppError::io("无法复制浏览器数据到备份目录", error))?;
        }
    }
    Ok(())
}

pub fn ensure_tree_without_reparse_points(path: &Path) -> AppResult<()> {
    if platform::is_reparse_point(path) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "该目录是符号链接或联接点，BrowserHub 拒绝在此执行破坏性操作。",
        ));
    }
    for entry in walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter()
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                return Err(AppError::with_detail(
                    "FILESYSTEM_ERROR",
                    "无法检查目录内容，已取消操作。",
                    error.to_string(),
                ));
            }
        };
        if entry.depth() > 0 && platform::is_reparse_point(entry.path()) {
            return Err(AppError::new(
                "ENVIRONMENT_DIRECTORY_INVALID",
                "环境目录中包含符号链接或联接点，BrowserHub 拒绝删除。",
            ));
        }
    }
    Ok(())
}

pub fn remove_tree(path: &Path) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }
    if !path.is_dir() {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "要删除的路径不是文件夹。",
        ));
    }
    ensure_tree_without_reparse_points(path)?;
    fs::remove_dir_all(path).map_err(|error| AppError::io("无法删除目录", error))
}

/// Moves a directory to a sibling temporary name. Used by restore so the
/// previous environment can be rolled back if copying fails.
pub fn move_to_sibling(path: &Path, suffix: &str) -> AppResult<PathBuf> {
    let parent = path.parent().ok_or_else(|| {
        AppError::new("VALIDATION_FAILED", "环境目录没有上级目录，无法执行该操作。")
    })?;
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "environment".to_string());
    let mut candidate = parent.join(format!("{name}.{suffix}"));
    let mut index = 1;
    while candidate.exists() {
        candidate = parent.join(format!("{name}.{suffix}-{index}"));
        index += 1;
    }
    fs::rename(path, &candidate).map_err(|error| AppError::io("无法移动现有环境目录", error))?;
    Ok(candidate)
}

pub fn slugify(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut previous_dash = false;
    for character in input.chars() {
        let invalid = matches!(
            character,
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
        ) || character.is_whitespace() || character.is_control();
        if invalid {
            if !previous_dash {
                result.push('-');
                previous_dash = true;
            }
        } else {
            result.push(character);
            previous_dash = false;
        }
    }
    let trimmed = result.trim_matches(['-', '.', ' ']).trim();
    let truncated: String = trimmed.chars().take(40).collect();
    if truncated.is_empty() {
        "environment".to_string()
    } else {
        truncated
    }
}

pub fn unique_backup_directory(root: &Path, environment_name: &str) -> PathBuf {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let slug = slugify(environment_name);
    let mut candidate = root.join(format!("{slug}-{stamp}"));
    let mut index = 2;
    while candidate.exists() {
        candidate = root.join(format!("{slug}-{stamp}-{index}"));
        index += 1;
    }
    candidate
}

pub fn is_dangerous_delete_target(path: &Path) -> bool {
    use crate::services::app_paths::is_drive_root;
    if is_drive_root(path) {
        return true;
    }
    let normalized = normalized_key(path);
    let protected = [
        std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".to_string()),
        std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string()),
        std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string()),
        std::env::var("USERPROFILE").unwrap_or_default(),
        std::env::var("LOCALAPPDATA").unwrap_or_default(),
        std::env::var("APPDATA").unwrap_or_default(),
        std::env::var("PUBLIC").unwrap_or_default(),
    ];
    protected
        .iter()
        .filter(|value| !value.trim().is_empty())
        .any(|value| {
            let protected = normalized_key(Path::new(value));
            normalized == protected
        })
}
