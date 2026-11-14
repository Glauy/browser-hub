use crate::database::{self, backups as backups_repo, browsers as browsers_repo, environments as environments_repo};
use crate::errors::{
    AppError, AppResult, BROWSER_CONFIG_IN_USE, CHROME_NOT_FOUND, ENVIRONMENT_ALREADY_RUNNING,
    ENVIRONMENT_DIRECTORY_NOT_FOUND, ENVIRONMENT_STATUS_UNKNOWN, VALIDATION_FAILED,
};
use crate::models::{
    now_iso, AppSettings, BootstrapState, BrowserConfig, CompleteSetupInput, CreateBrowserConfigInput,
    CreateEnvironmentInput, DetectedChrome, DirectoryInspection, DirectorySuggestion, Environment,
    EnvironmentRecord, EnvironmentStats, EnvironmentStatus, EnvironmentStatusInfo,
    ImportEnvironmentInput, SourceType, StorageInfo, UpdateBrowserConfigInput,
    UpdateEnvironmentInput,
};
use crate::services::app_paths::{
    is_drive_root, is_same_or_descendant, normalize_path, normalized_key, paths_equal,
    paths_overlap,
};
use crate::services::{chrome, filesystem, platform, process};
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn clean_name(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(VALIDATION_FAILED, "请输入环境名称。"));
    }
    if trimmed.chars().count() > 40 {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "环境名称不能超过 40 个字符。",
        ));
    }
    Ok(trimmed.to_string())
}

fn clean_description(raw: Option<String>) -> AppResult<Option<String>> {
    let value = raw.unwrap_or_default();
    let trimmed = value.trim();
    if trimmed.chars().count() > 160 {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "环境描述不能超过 160 个字符。",
        ));
    }
    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

fn clean_color(raw: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = raw else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let valid = trimmed.len() == 7
        && trimmed.starts_with('#')
        && trimmed[1..].chars().all(|character| character.is_ascii_hexdigit());
    if !valid {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "环境颜色格式无效，请重新选择颜色。",
        ));
    }
    Ok(Some(trimmed.to_uppercase()))
}

fn absolute_path(raw: &str, message: &str) -> AppResult<PathBuf> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err(AppError::new(VALIDATION_FAILED, message));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "路径必须是完整的绝对路径。",
        ));
    }
    Ok(path)
}

fn default_browser(database: &mut database::Database) -> AppResult<BrowserConfig> {
    browsers_repo::find_default(database)?.ok_or_else(|| {
        AppError::new(
            CHROME_NOT_FOUND,
            "尚未配置 Chrome，请先在“设置 → 浏览器”中选择 chrome.exe。",
        )
    })
}

pub(crate) fn ensure_not_reserved(
    state: &AppState,
    database: &mut database::Database,
    path: &Path,
    exclude_environment_id: Option<&str>,
) -> AppResult<()> {
    if is_drive_root(path) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "不能将磁盘根目录用作浏览器环境。",
        ));
    }
    if paths_overlap(path, &state.paths.app_data_dir) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "不能将 BrowserHub 的应用数据目录用作浏览器环境。",
        ));
    }
    if filesystem::is_dangerous_delete_target(path) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "该目录属于系统或用户配置目录，不能用作浏览器环境。",
        ));
    }
    let settings = state.settings_snapshot();
    let backup_root = PathBuf::from(settings.effective_backup_root());
    if paths_overlap(path, &backup_root) {
        return Err(AppError::new(
            "ENVIRONMENT_PATH_OVERLAP",
            "浏览器环境目录不能与备份目录重叠。",
        ));
    }
    let environment_root = PathBuf::from(&settings.environment_root_dir);
    if paths_equal(path, &environment_root) {
        return Err(AppError::new(
            "ENVIRONMENT_PATH_OVERLAP",
            "不能直接使用环境根目录作为单个环境。",
        ));
    }
    let existing = environments_repo::list_directories(database, exclude_environment_id)?;
    for directory in existing {
        if paths_overlap(path, Path::new(&directory)) {
            return Err(AppError::new(
                "ENVIRONMENT_PATH_OVERLAP",
                "该目录与已有环境目录重叠。每个环境必须使用独立的目录。",
            ));
        }
    }
    Ok(())
}

fn evaluate_with_scan(record: &EnvironmentRecord) -> EnvironmentStatusInfo {
    match process::scan_chrome_processes() {
        Ok(processes) => process::evaluate_status(record, &processes),
        Err(reason) => EnvironmentStatusInfo::unknown(
            record.environment.id.clone(),
            format!("{reason} 暂时无法确认 Chrome 是否在运行。"),
        ),
    }
}

pub(crate) fn require_stopped_for_destructive(
    record: &EnvironmentRecord,
    action: &str,
) -> AppResult<()> {
    let status = evaluate_with_scan(record);
    match status.status {
        EnvironmentStatus::Running => Err(AppError::new(
            ENVIRONMENT_ALREADY_RUNNING,
            format!("该环境正在运行，请先完全退出 Chrome 后再{action}。"),
        )),
        EnvironmentStatus::Unknown => Err(AppError::new(
            ENVIRONMENT_STATUS_UNKNOWN,
            format!(
                "无法确认该环境的 Chrome 是否已退出，已拒绝{action}。请关闭相关 Chrome 并刷新状态。"
            ),
        )),
        EnvironmentStatus::Error => Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "环境目录不存在，可能已被移动或删除。",
        )),
        EnvironmentStatus::Stopped => Ok(()),
    }
}

fn persist_status(
    state: &AppState,
    info: &EnvironmentStatusInfo,
    previous: Option<&EnvironmentRecord>,
) {
    let should_write = match previous {
        Some(record) => {
            record.environment.last_status != info.status || record.last_pid != info.pid
        }
        None => true,
    };
    if !should_write {
        return;
    }
    let result = state.with_database(|database| {
        environments_repo::update_status(
            database,
            &info.environment_id,
            info.status,
            info.pid,
            info.pid.and_then(process::process_start_time),
        )
    });
    if let Err(error) = result {
        log::warn!(
            "could not persist environment status for {}: {error}",
            info.environment_id
        );
    }
}

pub fn get_bootstrap_state(state: &AppState) -> AppResult<BootstrapState> {
    let settings = state.settings_snapshot();
    let (browsers, default_browser, environment_count, backup_count) =
        state.with_database(|database| {
            Ok((
                browsers_repo::list(database)?,
                browsers_repo::find_default(database)?,
                environments_repo::count(database)?,
                backups_repo::count(database)?,
            ))
        })?;

    Ok(BootstrapState {
        needs_setup: !settings.setup_completed,
        settings,
        browsers,
        default_browser,
        environment_count,
        backup_count,
        recommended_roots: recommended_roots(state),
        app_version: state.app_version(),
        app_data_dir: state.app_data_dir(),
        install_dir: state.install_dir(),
    })
}

fn directory_available(path: &Path) -> bool {
    path.parent().map(|parent| parent.exists()).unwrap_or(false)
}

pub fn recommended_roots(state: &AppState) -> Vec<DirectorySuggestion> {
    let settings = state.settings_snapshot();
    let default_path = crate::models::DEFAULT_ENVIRONMENT_ROOT.to_string();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
    let user_path = if user_profile.is_empty() {
        String::new()
    } else {
        crate::models::join_windows(&user_profile, "BrowserProfiles")
    };
    let public_path = std::env::var("PUBLIC")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| crate::models::join_windows(&value, "BrowserProfiles"))
        .unwrap_or_else(|| r"C:\Users\Public\BrowserProfiles".to_string());

    let mut roots = vec![
        DirectorySuggestion {
            path: default_path.clone(),
            label: "D 盘".to_string(),
            available: directory_available(Path::new(&default_path)),
            recommended: false,
        },
        DirectorySuggestion {
            path: user_path.clone(),
            label: "用户目录".to_string(),
            available: directory_available(Path::new(&user_path)),
            recommended: false,
        },
        DirectorySuggestion {
            path: public_path.clone(),
            label: "公共目录".to_string(),
            available: directory_available(Path::new(&public_path)),
            recommended: false,
        },
    ];

    let current = settings.environment_root_dir.trim();
    if !current.is_empty() && !roots.iter().any(|root| paths_equal(Path::new(&root.path), Path::new(current))) {
        roots.push(DirectorySuggestion {
            path: current.to_string(),
            label: "当前设置".to_string(),
            available: directory_available(Path::new(current)),
            recommended: false,
        });
    }

    let preferred = roots
        .iter()
        .position(|root| root.available && root.path.eq_ignore_ascii_case(&default_path))
        .or_else(|| roots.iter().position(|root| root.available));
    if let Some(index) = preferred {
        roots[index].recommended = true;
    }
    roots
}

pub fn list_environments(state: &AppState) -> AppResult<Vec<Environment>> {
    state.with_database(environments_repo::list)
}

pub fn create_environment(
    state: &AppState,
    input: CreateEnvironmentInput,
) -> AppResult<Environment> {
    let name = clean_name(&input.name)?;
    let description = clean_description(input.description)?;
    let color = clean_color(input.color)?;
    let settings = state.settings_snapshot();
    let parent_raw = input
        .parent_directory
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(settings.environment_root_dir.as_str());
    let parent = absolute_path(parent_raw, "请选择一个环境存放位置。")?;
    filesystem::prepare_directory(&parent)?;

    let browser = state.with_database(default_browser)?;
    chrome::validate_chrome_executable(&browser.executable_path).map_err(|error| {
        AppError::new(
            "CHROME_PATH_INVALID",
            format!(
                "设置中的 Chrome 不可用。请前往“设置 → 浏览器”重新选择。{}",
                error.message
            ),
        )
    })?;

    let id = format!("env_{}", &uuid::Uuid::new_v4().simple().to_string()[..12]);
    let directory = parent.join(&id);
    if directory.exists() {
        return Err(AppError::new(
            "VALIDATION_FAILED",
            "目标目录已存在，请重新创建或更换存放位置。",
        ));
    }

    state.with_database(|database| ensure_not_reserved(state, database, &directory, None))?;
    fs::create_dir(&directory).map_err(|error| AppError::io("无法创建环境目录", error))?;
    let directory = dunce::canonicalize(&directory).unwrap_or(directory);
    let directory_text = normalize_path(&directory);
    let timestamp = now_iso();
    let record = EnvironmentRecord {
        environment: Environment {
            id: id.clone(),
            name,
            description,
            user_data_dir: directory_text,
            source_type: SourceType::Managed,
            browser_config_id: browser.id,
            color,
            icon: None,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            last_launched_at: None,
            last_status: EnvironmentStatus::Stopped,
            is_default_profile: false,
        },
        last_pid: None,
        last_pid_started_at: None,
    };

    let insert_result = state.with_database(|database| {
        environments_repo::insert(database, &record)
    });
    if let Err(error) = insert_result {
        if let Err(cleanup) = fs::remove_dir(&record.environment.user_data_dir) {
            log::warn!(
                "could not remove empty environment directory after failed insert: {cleanup}"
            );
        }
        return Err(error);
    }
    log::info!("environment {} created at {}", id, record.environment.user_data_dir);
    Ok(record.environment)
}

pub fn import_environment(
    state: &AppState,
    input: ImportEnvironmentInput,
) -> AppResult<Environment> {
    let name = clean_name(&input.name)?;
    let description = clean_description(input.description)?;
    let color = clean_color(input.color)?;
    let path = absolute_path(&input.user_data_dir, "请选择要导入的目录。")?;
    if !path.exists() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "目录不存在，可能已被移动或删除。",
        ));
    }
    if !path.is_dir() {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "选择的路径不是文件夹。",
        ));
    }
    let name_of_dir = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if filesystem::is_profile_directory_name(name_of_dir) {
        return Err(AppError::new(
            "ENVIRONMENT_DIRECTORY_INVALID",
            "这是 Chrome 的 Profile 子目录。请选择它的上一级 User Data Directory。",
        ));
    }
    if !filesystem::can_write_directory(&path) {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "当前用户没有写入该目录的权限，Chrome 无法在此保存数据。",
        ));
    }
    let canonical = dunce::canonicalize(&path).unwrap_or(path);
    let directory_text = normalize_path(&canonical);

    let browser = state.with_database(default_browser)?;
    state.with_database(|database| {
        if let Some(existing) =
            environments_repo::find_by_user_data_dir(database, &directory_text)?
        {
            return Err(AppError::new(
                "ENVIRONMENT_ALREADY_IMPORTED",
                format!(
                    "该目录已经被环境「{}」使用。同一个目录不能同时绑定两个环境。",
                    existing.environment.name
                ),
            ));
        }
        ensure_not_reserved(state, database, &canonical, None)
    })?;

    let id = format!("env_{}", &uuid::Uuid::new_v4().simple().to_string()[..12]);
    let timestamp = now_iso();
    let record = EnvironmentRecord {
        environment: Environment {
            id: id.clone(),
            name,
            description,
            user_data_dir: directory_text,
            source_type: SourceType::Imported,
            browser_config_id: browser.id,
            color,
            icon: None,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            last_launched_at: None,
            last_status: EnvironmentStatus::Unknown,
            is_default_profile: false,
        },
        last_pid: None,
        last_pid_started_at: None,
    };
    state.with_database(|database| environments_repo::insert(database, &record))?;

    let info = evaluate_with_scan(&record);
    persist_status(state, &info, Some(&record));
    log::info!(
        "environment {} imported from {} (status {:?})",
        id,
        record.environment.user_data_dir,
        info.status
    );
    let mut environment = record.environment;
    environment.last_status = info.status;
    Ok(environment)
}

pub fn update_environment(
    state: &AppState,
    input: UpdateEnvironmentInput,
) -> AppResult<Environment> {
    let name = clean_name(&input.name)?;
    let description = clean_description(input.description)?;
    let color = clean_color(input.color)?;
    state.with_database(|database| {
        environments_repo::find(database, &input.id)?;
        environments_repo::update_metadata(
            database,
            &input.id,
            &name,
            description.as_deref(),
            color.as_deref(),
        )
    })
}

/// Marks an environment as the "default profile" — the one the plain Chrome
/// shortcut resolves to via the system junction. Pure metadata; use
/// `system_default::take_over` to actually repoint the junction.
pub fn remove_environment(state: &AppState, environment_id: &str) -> AppResult<()> {
    let record = state.with_database(|database| environments_repo::find(database, environment_id))?;
    let status = evaluate_with_scan(&record);
    if status.status == EnvironmentStatus::Running {
        return Err(AppError::new(
            ENVIRONMENT_ALREADY_RUNNING,
            "该环境正在运行，请先完全退出 Chrome 后再从列表移除。",
        ));
    }
    if status.status == EnvironmentStatus::Unknown {
        log::warn!(
            "environment {} removed while its runtime status was unknown",
            environment_id
        );
    }
    state.with_database(|database| environments_repo::remove(database, environment_id))?;
    log::info!("environment {environment_id} removed from BrowserHub");
    Ok(())
}

pub fn delete_environment(state: &AppState, environment_id: &str) -> AppResult<()> {
    let record = state.with_database(|database| environments_repo::find(database, environment_id))?;
    require_stopped_for_destructive(&record, "删除")?;

    let path = PathBuf::from(&record.environment.user_data_dir);
    if !path.is_dir() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "环境目录不存在，可能已被移动或删除。请改用“从 BrowserHub 移除”。",
        ));
    }
    state.with_database(|database| {
        ensure_not_reserved(state, database, &path, Some(environment_id))
    })?;
    filesystem::remove_tree(&path)?;
    log::info!(
        "environment directory permanently deleted: {}",
        record.environment.user_data_dir
    );

    if let Err(error) = state.with_database(|database| {
        environments_repo::remove(database, environment_id)
    }) {
        log::error!(
            "environment directory {} was deleted but the database record failed to update: {error}",
            record.environment.user_data_dir
        );
        return Err(AppError::with_detail(
            "DATABASE_ERROR",
            "目录已删除，但管理记录更新失败。请刷新列表后重试移除记录。",
            error.message,
        ));
    }
    Ok(())
}

pub fn get_environment_status(
    state: &AppState,
    environment_id: &str,
) -> AppResult<EnvironmentStatusInfo> {
    let record = state.with_database(|database| environments_repo::find(database, environment_id))?;
    let info = evaluate_with_scan(&record);
    persist_status(state, &info, Some(&record));
    Ok(info)
}

pub fn refresh_environment_status(state: &AppState) -> AppResult<Vec<EnvironmentStatusInfo>> {
    let records = state.with_database(environments_repo::list_records)?;
    let processes = match process::scan_chrome_processes() {
        Ok(processes) => processes,
        Err(reason) => {
            let infos = process::all_unknown(
                &records,
                &format!("{reason} 暂时无法确认各环境的运行状态。"),
            );
            for (record, info) in records.iter().zip(infos.iter()) {
                persist_status(state, info, Some(record));
            }
            return Ok(infos);
        }
    };
    let infos: Vec<EnvironmentStatusInfo> = records
        .iter()
        .map(|record| process::evaluate_status(record, &processes))
        .collect();
    for (record, info) in records.iter().zip(infos.iter()) {
        persist_status(state, info, Some(record));
    }
    Ok(infos)
}

pub fn get_environment_stats(
    state: &AppState,
    environment_id: &str,
) -> AppResult<EnvironmentStats> {
    let record = state.with_database(|database| environments_repo::find(database, environment_id))?;
    let (size_bytes, file_count) =
        filesystem::directory_stats(Path::new(&record.environment.user_data_dir))?;
    Ok(EnvironmentStats {
        environment_id: environment_id.to_string(),
        size_bytes,
        file_count,
        measured_at: now_iso(),
    })
}

pub fn launch_environment(
    state: &AppState,
    environment_id: &str,
) -> AppResult<EnvironmentStatusInfo> {
    let record = state.with_database(|database| environments_repo::find(database, environment_id))?;
    let browser = state.with_database(|database| {
        match browsers_repo::find_optional(database, &record.environment.browser_config_id)? {
            Some(browser) => Ok(Some(browser)),
            None => browsers_repo::find_default(database),
        }
    })?;
    let browser = browser.ok_or_else(|| {
        AppError::new(
            CHROME_NOT_FOUND,
            "尚未配置 Chrome，请先在“设置 → 浏览器”中选择 chrome.exe。",
        )
    })?;
    let executable = chrome::validate_chrome_executable(&browser.executable_path)?;

    let status = evaluate_with_scan(&record);
    state.with_database(|database| {
        environments_repo::update_status(
            database,
            environment_id,
            status.status,
            status.pid,
            status.pid.and_then(process::process_start_time),
        )
    })?;
    match status.status {
        EnvironmentStatus::Running => {
            return Err(AppError::new(
                ENVIRONMENT_ALREADY_RUNNING,
                "该环境已经在运行中。",
            ))
        }
        EnvironmentStatus::Unknown => {
            return Err(AppError::new(
                ENVIRONMENT_STATUS_UNKNOWN,
                status
                    .reason
                    .clone()
                    .unwrap_or_else(|| "无法确认该环境是否已退出，已拒绝重复启动。".to_string()),
            ))
        }
        EnvironmentStatus::Error => {
            return Err(AppError::new(
                ENVIRONMENT_DIRECTORY_NOT_FOUND,
                "环境目录不存在，可能已被移动或删除。请重新创建环境或重新导入目录。",
            ))
        }
        EnvironmentStatus::Stopped => {}
    }

    let directory = PathBuf::from(&record.environment.user_data_dir);
    if !directory.is_dir() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "环境目录不存在，可能已被移动或删除。",
        ));
    }
    if !filesystem::can_write_directory(&directory) {
        return Err(AppError::new(
            "PERMISSION_DENIED",
            "当前用户没有写入环境目录的权限，Chrome 无法保存数据。",
        ));
    }

    let mut child = Command::new(&executable)
        .arg(format!("--user-data-dir={}", record.environment.user_data_dir))
        .arg("--new-window")
        .spawn()
        .map_err(|error| {
            AppError::with_detail(
                "LAUNCH_FAILED",
                "无法启动 Chrome。请确认 Chrome 安装正常，且没有被安全软件阻止。",
                format!("spawn {}: {error}", executable.display()),
            )
        })?;

    let pid = child.id();
    std::thread::sleep(std::time::Duration::from_millis(400));
    let exited = match child.try_wait() {
        Ok(status) => status,
        Err(error) => {
            log::warn!("could not query launched Chrome process: {error}");
            None
        }
    };

    if let Some(exit_status) = exited {
        let info = evaluate_with_scan(&record);
        if info.status == EnvironmentStatus::Running {
            if let Some(running_pid) = info.pid {
                if let Err(error) = state.with_database(|database| {
                    environments_repo::mark_launched(
                        database,
                        environment_id,
                        running_pid,
                        process::process_start_time(running_pid),
                    )
                }) {
                    log::warn!("could not record launch status: {error}");
                }
            }
            return Ok(info);
        }
        log::warn!(
            "Chrome launch for {} exited early with {exit_status}",
            environment_id
        );
        return Err(AppError::new(
            "LAUNCH_FAILED",
            "Chrome 启动后立即退出。请检查 Chrome 安装是否正常，或是否有安全软件阻止启动。",
        ));
    }

    let started_at = process::process_start_time(pid);
    if let Err(error) = state.with_database(|database| {
        environments_repo::mark_launched(database, environment_id, pid, started_at)
    }) {
        log::warn!("could not record launched environment: {error}");
    }
    log::info!(
        "launched environment {} with pid {} using {}",
        environment_id,
        pid,
        executable.display()
    );

    Ok(EnvironmentStatusInfo {
        environment_id: environment_id.to_string(),
        status: EnvironmentStatus::Running,
        pid: Some(pid),
        checked_at: now_iso(),
        reliable: true,
        reason: None,
    })
}

pub fn inspect_environment_directory(
    state: &AppState,
    raw_path: &str,
) -> AppResult<DirectoryInspection> {
    let path = absolute_path(raw_path, "请选择一个目录。")?;
    let managed = state.with_database(|database| environments_repo::list_directories(database, None))?;
    filesystem::inspect_directory(&path, &managed)
}

pub fn get_storage_info(state: &AppState, raw_path: &str) -> AppResult<StorageInfo> {
    let path = absolute_path(raw_path, "请选择一个目录。")?;
    let environment_count = state.with_database(environments_repo::count)?;
    let accessible = path.is_dir();
    let space = platform::disk_space(&path).or_else(|| {
        path.ancestors()
            .skip(1)
            .find(|ancestor| ancestor.exists())
            .and_then(platform::disk_space)
    });
    Ok(StorageInfo {
        path: normalize_path(&path),
        accessible,
        total_bytes: space.map(|(_, total)| total),
        available_bytes: space.map(|(available, _)| available),
        environment_count,
    })
}

pub fn open_directory(raw_path: &str) -> AppResult<()> {
    let path = absolute_path(raw_path, "请选择一个目录。")?;
    if !path.exists() {
        return Err(AppError::new(
            ENVIRONMENT_DIRECTORY_NOT_FOUND,
            "目录不存在，可能已被移动或删除。",
        ));
    }
    platform::open_in_explorer(&path).map_err(|detail| {
        AppError::with_detail(
            "FILESYSTEM_ERROR",
            "无法在资源管理器中打开该目录。",
            detail,
        )
    })
}

pub fn get_app_settings(state: &AppState) -> AppResult<AppSettings> {
    Ok(state.settings_snapshot())
}

pub fn update_app_settings(
    state: &AppState,
    mut next: AppSettings,
) -> AppResult<AppSettings> {
    let _guard = state.lock_settings_update();
    let current = state.settings_snapshot();

    next.environment_root_dir = next.environment_root_dir.trim().to_string();
    if next.environment_root_dir.is_empty() {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "请选择一个环境根目录。",
        ));
    }
    let root_path = absolute_path(&next.environment_root_dir, "请选择一个环境根目录。")?;
    if is_drive_root(&root_path) {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "不能使用磁盘根目录作为环境根目录，请选择具体的文件夹。",
        ));
    }
    next.environment_root_dir = normalize_path(&root_path);
    next.backup_root_dir = next
        .backup_root_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let root_changed =
        normalized_key(Path::new(&current.environment_root_dir)) != normalized_key(&root_path);
    let backup_changed = current.backup_root_dir != next.backup_root_dir;
    if root_changed {
        filesystem::prepare_directory(&root_path)?;
    }

    let backup_path = next
        .backup_root_dir
        .as_deref()
        .map(|value| absolute_path(value, "请选择一个备份目录。"))
        .transpose()?;
    if let Some(path) = &backup_path {
        if paths_overlap(path, &root_path) && !is_same_or_descendant(path, &root_path) {
            return Err(AppError::new(
                "BACKUP_LOCATION_INVALID",
                "备份目录不能包含环境根目录。",
            ));
        }
        if paths_equal(path, &root_path) {
            return Err(AppError::new(
                "BACKUP_LOCATION_INVALID",
                "备份目录不能与环境根目录相同，请选择一个子目录或其他位置。",
            ));
        }
    }
    if root_changed || backup_changed {
        let backup = backup_path
            .map(|path| normalize_path(&path))
            .unwrap_or_else(|| crate::models::join_windows(&next.environment_root_dir, "backups"));
        filesystem::prepare_directory(Path::new(&backup)).map_err(|error| {
            AppError::new(
                "BACKUP_LOCATION_INVALID",
                format!("无法使用备份目录：{}", error.message),
            )
        })?;
    }

    next.setup_completed = current.setup_completed || next.setup_completed;
    if current.launch_on_startup != next.launch_on_startup {
        platform::apply_autostart(next.launch_on_startup).map_err(|detail| {
            AppError::with_detail(
                "CONFIG_ERROR",
                "无法更新开机启动设置，请检查系统权限。",
                detail,
            )
        })?;
    }

    let saved = state.save_settings(next)?;
    log::info!("application settings updated");
    Ok(saved)
}

pub fn complete_setup(
    state: &AppState,
    input: CompleteSetupInput,
) -> AppResult<()> {
    let _guard = state.lock_settings_update();
    let current = state.settings_snapshot();
    let root = absolute_path(&input.environment_root_dir, "请选择一个环境根目录。")?;
    if is_drive_root(&root) {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "不能使用磁盘根目录作为环境根目录，请选择具体的文件夹。",
        ));
    }
    let root_text = normalize_path(&root);
    filesystem::prepare_directory(&root)?;

    let backup = input
        .backup_root_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| absolute_path(value, "请选择一个备份目录。"))
        .transpose()?
        .unwrap_or_else(|| root.join("backups"));
    if paths_equal(&backup, &root) {
        return Err(AppError::new(
            "BACKUP_LOCATION_INVALID",
            "备份目录不能与环境根目录相同。",
        ));
    }
    filesystem::prepare_directory(&backup).map_err(|error| {
        AppError::new(
            "BACKUP_LOCATION_INVALID",
            format!("无法使用备份目录：{}", error.message),
        )
    })?;

    if let Some(raw_path) = input
        .chrome_executable_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let executable = chrome::validate_chrome_executable(raw_path)?;
        let executable_text = normalize_path(&executable);
        let version = chrome::executable_version(&executable);
        state.with_database(|database| {
            if let Some(existing) = browsers_repo::find_by_path(database, &executable_text)? {
                browsers_repo::set_default(database, &existing.id)?;
                return Ok(());
            }
            let timestamp = now_iso();
            let config = BrowserConfig {
                id: format!("browser_{}", &uuid::Uuid::new_v4().simple().to_string()[..10]),
                name: "Google Chrome".to_string(),
                executable_path: executable_text,
                version,
                is_default: true,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            };
            database.with_transaction(|transaction| {
                browsers_repo::clear_default(transaction)?;
                browsers_repo::insert(transaction, &config)
            })
        })?;
    }

    let mut settings = current;
    settings.environment_root_dir = root_text;
    settings.backup_root_dir = Some(normalize_path(&backup));
    settings.setup_completed = true;
    state.save_settings(settings)?;
    log::info!("initial BrowserHub setup completed");
    Ok(())
}

pub fn get_browser_configs(state: &AppState) -> AppResult<Vec<BrowserConfig>> {
    state.with_database(browsers_repo::list)
}

pub fn detect_chrome() -> Vec<DetectedChrome> {
    chrome::detect()
}

pub fn create_browser_config(
    state: &AppState,
    input: CreateBrowserConfigInput,
) -> AppResult<BrowserConfig> {
    let executable = chrome::validate_chrome_executable(&input.executable_path)?;
    let executable_text = normalize_path(&executable);
    let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Google Chrome")
        .to_string();
    if name.chars().count() > 60 {
        return Err(AppError::new(
            VALIDATION_FAILED,
            "Chrome 配置名称不能超过 60 个字符。",
        ));
    }
    let version = chrome::executable_version(&executable);
    let timestamp = now_iso();

    state.with_database(|database| {
        if browsers_repo::find_by_path(database, &executable_text)?.is_some() {
            return Err(AppError::new(
                "BROWSER_CONFIG_DUPLICATE",
                "这个 Chrome 安装已经添加过了。",
            ));
        }
        let is_default = browsers_repo::find_default(database)?.is_none();
        let config = BrowserConfig {
            id: format!("browser_{}", &uuid::Uuid::new_v4().simple().to_string()[..10]),
            name,
            executable_path: executable_text,
            version,
            is_default,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        browsers_repo::insert(database, &config)?;
        Ok(config)
    })
}

pub fn update_browser_config(
    state: &AppState,
    input: UpdateBrowserConfigInput,
) -> AppResult<BrowserConfig> {
    state.with_database(|database| {
        let mut config = browsers_repo::find(database, &input.id)?;
        if let Some(name) = input.name.as_deref() {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                return Err(AppError::new(
                    VALIDATION_FAILED,
                    "Chrome 配置名称不能为空。",
                ));
            }
            if trimmed.chars().count() > 60 {
                return Err(AppError::new(
                    VALIDATION_FAILED,
                    "Chrome 配置名称不能超过 60 个字符。",
                ));
            }
            config.name = trimmed.to_string();
        }
        if let Some(raw_path) = input.executable_path.as_deref() {
            let executable = chrome::validate_chrome_executable(raw_path)?;
            let executable_text = normalize_path(&executable);
            if let Some(existing) = browsers_repo::find_by_path(database, &executable_text)? {
                if existing.id != config.id {
                    return Err(AppError::new(
                        "BROWSER_CONFIG_DUPLICATE",
                        "这个 Chrome 安装已经添加过了。",
                    ));
                }
            }
            config.executable_path = executable_text;
            config.version = chrome::executable_version(&executable);
        }
        config.updated_at = now_iso();

        let make_default = input.is_default == Some(true);
        if make_default {
            config.is_default = true;
            database.with_transaction(|transaction| {
                browsers_repo::clear_default(transaction)?;
                browsers_repo::update(transaction, &config)
            })?;
        } else {
            config.is_default = browsers_repo::find(database, &config.id)?.is_default;
            browsers_repo::update(database, &config)?;
        }
        browsers_repo::find(database, &config.id)
    })
}

pub fn delete_browser_config(state: &AppState, browser_config_id: &str) -> AppResult<()> {
    state.with_database(|database| {
        let config = browsers_repo::find(database, browser_config_id)?;
        if browsers_repo::count(database)? <= 1 {
            return Err(AppError::new(
                BROWSER_CONFIG_IN_USE,
                "至少需要保留一个 Chrome 配置。请先添加其他 Chrome 安装。",
            ));
        }
        if environments_repo::count_for_browser(database, browser_config_id)? > 0 {
            return Err(AppError::new(
                BROWSER_CONFIG_IN_USE,
                "仍有环境在使用这个 Chrome 安装，无法删除。",
            ));
        }
        browsers_repo::delete(database, browser_config_id)?;
        if config.is_default {
            if let Some(first) = browsers_repo::list(database)?.into_iter().next() {
                browsers_repo::set_default(database, &first.id)?;
            }
        }
        Ok(())
    })
}

pub fn select_directory(
    initial_dir: Option<String>,
    title: Option<String>,
) -> AppResult<Option<String>> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(title) = title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        dialog = dialog.set_title(title);
    }
    if let Some(directory) = initial_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let path = Path::new(directory);
        if path.is_dir() {
            dialog = dialog.set_directory(path);
        }
    }
    Ok(dialog.pick_folder().map(|path| normalize_path(&path)))
}

pub fn select_executable(title: Option<String>) -> AppResult<Option<String>> {
    let mut dialog = rfd::FileDialog::new().add_filter("Chrome", &["exe"]);
    if let Some(title) = title.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        dialog = dialog.set_title(title);
    }
    Ok(dialog
        .pick_file()
        .map(|path| normalize_path(&path)))
}

