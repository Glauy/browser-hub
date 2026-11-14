use crate::database::Database;
use crate::errors::{AppError, AppResult};
use crate::models::AppSettings;
use crate::services::app_paths::AppPaths;
use crate::services::settings_store;
use std::sync::{Mutex, MutexGuard, RwLock};

pub struct AppState {
    pub paths: AppPaths,
    pub database: Mutex<Database>,
    settings: RwLock<AppSettings>,
    settings_update: Mutex<()>,
}

impl AppState {
    pub fn new(paths: AppPaths) -> AppResult<Self> {
        let settings = settings_store::load_settings(&paths.config_path);
        let database = Database::open(&paths.database_path)?;
        Ok(Self {
            paths,
            database: Mutex::new(database),
            settings: RwLock::new(settings),
            settings_update: Mutex::new(()),
        })
    }

    pub fn settings_snapshot(&self) -> AppSettings {
        match self.settings.read() {
            Ok(settings) => settings.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }

    pub fn with_database<T>(
        &self,
        operation: impl FnOnce(&mut Database) -> AppResult<T>,
    ) -> AppResult<T> {
        let mut database = match self.database.lock() {
            Ok(database) => database,
            Err(poisoned) => poisoned.into_inner(),
        };
        operation(&mut database)
    }

    /// Serializes settings mutations (several settings controls can save in
    /// quick succession from the renderer).
    pub fn lock_settings_update(&self) -> MutexGuard<'_, ()> {
        match self.settings_update.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    pub fn save_settings(&self, settings: AppSettings) -> AppResult<AppSettings> {
        settings_store::save_settings(&self.paths.config_path, &settings)?;
        match self.settings.write() {
            Ok(mut current) => *current = settings.clone(),
            Err(poisoned) => *poisoned.into_inner() = settings.clone(),
        }
        Ok(settings)
    }

    pub fn app_data_dir(&self) -> String {
        crate::services::app_paths::normalize_path(&self.paths.app_data_dir)
    }

    /// Where the running executable lives. For an NSIS install this is the
    /// directory the user picked (recorded by the uninstaller registry key);
    /// for a portable/dev binary it is simply the exe's parent directory.
    /// Read-only in the UI either way.
    pub fn install_dir(&self) -> Option<String> {
        let exe = std::env::current_exe().ok()?;
        let parent = exe.parent()?;
        Some(crate::services::app_paths::normalize_path(parent))
    }

    pub fn app_version(&self) -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }
}

#[allow(dead_code)]
pub fn state_of(app: &tauri::AppHandle) -> Result<tauri::State<'_, AppState>, AppError> {
    use tauri::Manager;
    app.try_state::<AppState>().ok_or_else(|| {
        AppError::new(
            "APP_STATE_UNAVAILABLE",
            "BrowserHub 后台服务尚未准备好，请稍后重试。",
        )
    })
}
