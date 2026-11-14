use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum CloseBehavior {
    #[default]
    Exit,
    Minimize,
}

#[allow(dead_code)]
impl CloseBehavior {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Exit => "exit",
            Self::Minimize => "minimize",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum EnvironmentStatus {
    #[default]
    Unknown,
    Running,
    Stopped,
    Error,
}

impl EnvironmentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::Running => "running",
            Self::Stopped => "stopped",
            Self::Error => "error",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "running" => Self::Running,
            "stopped" => Self::Stopped,
            "error" => Self::Error,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SourceType {
    #[default]
    Managed,
    Imported,
}

impl SourceType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Managed => "managed",
            Self::Imported => "imported",
        }
    }

    pub fn from_db(value: &str) -> Self {
        if value == "imported" {
            Self::Imported
        } else {
            Self::Managed
        }
    }
}

pub const DEFAULT_ENVIRONMENT_ROOT: &str = r"D:\BrowserProfiles";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub environment_root_dir: String,
    pub backup_root_dir: Option<String>,
    pub close_behavior: CloseBehavior,
    pub launch_on_startup: bool,
    pub minimize_to_tray: bool,
    pub setup_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            environment_root_dir: DEFAULT_ENVIRONMENT_ROOT.to_string(),
            backup_root_dir: None,
            // Close-to-tray is the desktop-app convention for a manager that
            // keeps running while Chrome environments are in use.
            close_behavior: CloseBehavior::Minimize,
            launch_on_startup: false,
            minimize_to_tray: true,
            setup_completed: false,
        }
    }
}

impl AppSettings {
    pub fn effective_backup_root(&self) -> String {
        match self
            .backup_root_dir
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            Some(value) => value.to_string(),
            None => join_windows(&self.environment_root_dir, "backups"),
        }
    }
}

pub fn join_windows(parent: &str, child: &str) -> String {
    let trimmed = parent.trim_end_matches(['\\', '/']);
    if trimmed.is_empty() {
        child.to_string()
    } else {
        format!("{trimmed}\\{child}")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserConfig {
    pub id: String,
    pub name: String,
    pub executable_path: String,
    pub version: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedChrome {
    pub executable_path: String,
    pub version: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub user_data_dir: String,
    pub source_type: SourceType,
    pub browser_config_id: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_launched_at: Option<String>,
    pub last_status: EnvironmentStatus,
    /// The environment the plain Chrome shortcut (system junction) resolves to.
    pub is_default_profile: bool,
}

/// Database-only view of an environment. Tracking fields power process
/// identification but are never exposed to the renderer.
#[derive(Debug, Clone)]
pub struct EnvironmentRecord {
    pub environment: Environment,
    pub last_pid: Option<u32>,
    pub last_pid_started_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStatusInfo {
    pub environment_id: String,
    pub status: EnvironmentStatus,
    pub pid: Option<u32>,
    pub checked_at: String,
    pub reliable: bool,
    pub reason: Option<String>,
}

impl EnvironmentStatusInfo {
    pub fn unknown(environment_id: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            environment_id: environment_id.into(),
            status: EnvironmentStatus::Unknown,
            pid: None,
            checked_at: now_iso(),
            reliable: false,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentStats {
    pub environment_id: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub measured_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryInspection {
    pub path: String,
    pub exists: bool,
    pub is_directory: bool,
    pub writable: bool,
    pub is_chrome_user_data_dir: bool,
    pub is_profile_directory: bool,
    pub suggested_user_data_dir: Option<String>,
    pub profile_count: u32,
    pub already_managed: bool,
    pub free_bytes: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySuggestion {
    pub path: String,
    pub label: String,
    pub available: bool,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub path: String,
    pub accessible: bool,
    pub total_bytes: Option<u64>,
    pub available_bytes: Option<u64>,
    pub environment_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    pub id: String,
    pub environment_id: String,
    pub environment_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub note: Option<String>,
    pub environment_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapState {
    pub settings: AppSettings,
    pub browsers: Vec<BrowserConfig>,
    pub default_browser: Option<BrowserConfig>,
    pub environment_count: i64,
    pub backup_count: i64,
    pub needs_setup: bool,
    pub recommended_roots: Vec<DirectorySuggestion>,
    pub app_version: String,
    pub app_data_dir: String,
    /// Directory the installed copy runs from (parent of the executable).
    /// Null when running a portable/dev binary outside the NSIS install.
    pub install_dir: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteSetupInput {
    pub environment_root_dir: String,
    pub backup_root_dir: Option<String>,
    pub chrome_executable_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEnvironmentInput {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub parent_directory: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEnvironmentInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEnvironmentInput {
    pub user_data_dir: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBrowserConfigInput {
    pub executable_path: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBrowserConfigInput {
    pub id: String,
    pub name: Option<String>,
    pub executable_path: Option<String>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEnvironmentInput {
    pub environment_id: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowStateFile {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}
