use serde::Serialize;
use std::fmt;

/// Business error returned to the frontend. Messages are always user-facing
/// Chinese text; diagnostic details stay in the local log.
#[derive(Debug, Clone)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(
        code: &'static str,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn internal(context: &str, detail: impl Into<String>) -> Self {
        Self::with_detail(
            "INTERNAL_ERROR",
            format!("{context}。请稍后重试，或重新启动 BrowserHub。"),
            detail,
        )
    }

    pub fn io(context: &str, error: std::io::Error) -> Self {
        match error.kind() {
            std::io::ErrorKind::PermissionDenied => Self::with_detail(
                "PERMISSION_DENIED",
                "当前用户没有访问该目录的权限。请选择一个有写入权限的位置。",
                format!("{context}: {error}"),
            ),
            std::io::ErrorKind::NotFound => Self::with_detail(
                "ENVIRONMENT_DIRECTORY_NOT_FOUND",
                "目录不存在，可能已被移动或删除。",
                format!("{context}: {error}"),
            ),
            _ => Self::with_detail(
                "FILESYSTEM_ERROR",
                "无法完成文件操作。请检查磁盘是否已连接、空间是否充足。",
                format!("{context}: {error}"),
            ),
        }
    }

    pub fn into_result<T>(self) -> ApiResult<T> {
        if let Some(detail) = &self.detail {
            log::error!("command failed [{}]: {} | {}", self.code, self.message, detail);
        } else {
            log::warn!("command failed [{}]: {}", self.code, self.message);
        }
        ApiResult {
            success: false,
            data: None,
            error: Some(ApiErrorPayload {
                code: self.code.to_string(),
                message: self.message,
            }),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiErrorPayload {
    pub code: String,
    pub message: String,
}

/// Stable IPC envelope. `data` is present (possibly `null`) on success so the
/// frontend can distinguish success from a missing payload.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResult<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiErrorPayload>,
}

impl<T> ApiResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }
}

pub fn api<T>(operation: impl FnOnce() -> AppResult<T>) -> ApiResult<T> {
    match operation() {
        Ok(data) => ApiResult::ok(data),
        Err(error) => error.into_result(),
    }
}

pub async fn api_blocking<T, F>(app: tauri::AppHandle, operation: F) -> ApiResult<T>
where
    T: Send + 'static,
    F: FnOnce(&crate::state::AppState) -> AppResult<T> + Send + 'static,
{
    use tauri::Manager;
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let state = app.try_state::<crate::state::AppState>().ok_or_else(|| {
            AppError::new(
                "APP_STATE_UNAVAILABLE",
                "BrowserHub 后台服务尚未准备好，请稍后重试。",
            )
        })?;
        operation(state.inner())
    })
    .await;

    match joined {
        Ok(result) => match result {
            Ok(data) => ApiResult::ok(data),
            Err(error) => error.into_result(),
        },
        Err(error) => AppError::internal("后台任务执行失败", error.to_string()).into_result(),
    }
}

// Stable error codes returned to the renderer. They are part of the IPC
// contract even when a given command does not raise every one of them yet.
#[allow(dead_code)]
mod error_codes {
    pub const VALIDATION_FAILED: &str = "VALIDATION_FAILED";
    pub const ENVIRONMENT_NOT_FOUND: &str = "ENVIRONMENT_NOT_FOUND";
    pub const ENVIRONMENT_DIRECTORY_NOT_FOUND: &str = "ENVIRONMENT_DIRECTORY_NOT_FOUND";
    pub const ENVIRONMENT_DIRECTORY_INVALID: &str = "ENVIRONMENT_DIRECTORY_INVALID";
    pub const ENVIRONMENT_DIRECTORY_IN_USE: &str = "ENVIRONMENT_DIRECTORY_IN_USE";
    pub const ENVIRONMENT_ALREADY_RUNNING: &str = "ENVIRONMENT_ALREADY_RUNNING";
    pub const ENVIRONMENT_ALREADY_IMPORTED: &str = "ENVIRONMENT_ALREADY_IMPORTED";
    pub const ENVIRONMENT_STATUS_UNKNOWN: &str = "ENVIRONMENT_STATUS_UNKNOWN";
    pub const ENVIRONMENT_PATH_OVERLAP: &str = "ENVIRONMENT_PATH_OVERLAP";
    pub const CHROME_NOT_FOUND: &str = "CHROME_NOT_FOUND";
    pub const CHROME_PATH_INVALID: &str = "CHROME_PATH_INVALID";
    pub const BROWSER_CONFIG_NOT_FOUND: &str = "BROWSER_CONFIG_NOT_FOUND";
    pub const BROWSER_CONFIG_IN_USE: &str = "BROWSER_CONFIG_IN_USE";
    pub const BROWSER_CONFIG_DUPLICATE: &str = "BROWSER_CONFIG_DUPLICATE";
    pub const BACKUP_NOT_FOUND: &str = "BACKUP_NOT_FOUND";
    pub const BACKUP_FAILED: &str = "BACKUP_FAILED";
    pub const BACKUP_LOCATION_INVALID: &str = "BACKUP_LOCATION_INVALID";
    pub const RESTORE_FAILED: &str = "RESTORE_FAILED";
    pub const BACKUP_DELETE_FAILED: &str = "BACKUP_DELETE_FAILED";
}

pub use error_codes::*;
