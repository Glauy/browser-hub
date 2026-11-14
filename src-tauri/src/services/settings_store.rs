use crate::errors::{AppError, AppResult};
use crate::models::AppSettings;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn load_settings(path: &Path) -> AppSettings {
    match read_settings(path) {
        Ok(settings) => settings,
        Err(reason) => {
            if path.exists() {
                log::warn!("config.json could not be read ({reason}); trying backup");
                let backup = backup_path(path);
                if let Ok(settings) = read_settings(&backup) {
                    log::warn!("recovered settings from config.json.bak");
                    return settings;
                }
                let corrupt = path.with_file_name(format!(
                    "config.corrupt-{}.json",
                    chrono::Local::now().format("%Y%m%d-%H%M%S")
                ));
                if let Err(error) = fs::rename(path, &corrupt) {
                    log::warn!("could not move corrupt config aside: {error}");
                } else {
                    log::warn!("corrupt config moved to {}", corrupt.display());
                }
            }
            AppSettings::default()
        }
    }
}

fn read_settings(path: &Path) -> Result<AppSettings, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    if content.trim().is_empty() {
        return Err("config file is empty".to_string());
    }
    let mut settings: AppSettings =
        serde_json::from_str(&content).map_err(|error| error.to_string())?;
    settings.environment_root_dir = settings.environment_root_dir.trim().to_string();
    if settings.environment_root_dir.is_empty() {
        settings.environment_root_dir = AppSettings::default().environment_root_dir;
    }
    settings.backup_root_dir = settings
        .backup_root_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Ok(settings)
}

pub fn save_settings(path: &Path, settings: &AppSettings) -> AppResult<()> {
    let parent = path.parent().ok_or_else(|| {
        AppError::new("CONFIG_ERROR", "无法确定配置文件的位置。")
    })?;
    fs::create_dir_all(parent)
        .map_err(|error| AppError::io("无法创建配置目录", error))?;

    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| AppError::internal("无法序列化应用设置", error.to_string()))?;
    let temp = path.with_extension("json.tmp");

    {
        let mut file = fs::File::create(&temp)
            .map_err(|error| AppError::io("无法写入应用设置", error))?;
        file.write_all(content.as_bytes())
            .map_err(|error| AppError::io("无法写入应用设置", error))?;
        file.write_all(b"\n")
            .map_err(|error| AppError::io("无法写入应用设置", error))?;
        file.sync_all()
            .map_err(|error| AppError::io("无法保存应用设置", error))?;
    }

    if path.exists() {
        let backup = backup_path(path);
        if let Err(error) = fs::copy(path, &backup) {
            log::warn!("could not update config backup: {error}");
        }
    }

    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(AppError::io("无法保存应用设置", error));
    }

    Ok(())
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_file_name("config.json.bak")
}
