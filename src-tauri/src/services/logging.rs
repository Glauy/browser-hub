use chrono::Local;
use log::{Level, LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

struct Logger {
    directory: PathBuf,
    state: Mutex<LoggerState>,
}

struct LoggerState {
    date: String,
    file: Option<File>,
}

impl Logger {
    fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            state: Mutex::new(LoggerState {
                date: String::new(),
                file: None,
            }),
        }
    }

    fn write_record(&self, record: &Record<'_>) {
        let now = Local::now();
        let date = now.format("%Y-%m-%d").to_string();
        let line = format!(
            "{} [{:<5}] {}: {}\n",
            now.format("%Y-%m-%d %H:%M:%S%.3f"),
            record.level(),
            record.target(),
            record.args()
        );

        let mut state = match self.state.lock() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };

        if state.date != date || state.file.is_none() {
            let path = self.directory.join(format!("browserhub-{date}.log"));
            match OpenOptions::new().create(true).append(true).open(&path) {
                Ok(file) => {
                    state.file = Some(file);
                    state.date = date;
                }
                Err(error) => {
                    eprintln!("BrowserHub log file unavailable: {error}");
                    state.file = None;
                }
            }
        }

        if let Some(file) = state.file.as_mut() {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }

        if cfg!(debug_assertions) {
            eprint!("{line}");
        }
    }
}

impl Log for Logger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            self.write_record(record);
        }
    }

    fn flush(&self) {
        if let Ok(mut state) = self.state.lock() {
            if let Some(file) = state.file.as_mut() {
                let _ = file.flush();
            }
        }
    }
}

pub fn init(directory: &Path) {
    if let Err(error) = fs::create_dir_all(directory) {
        eprintln!("Could not create BrowserHub log directory: {error}");
        return;
    }

    prune_old_logs(directory, 7);

    let logger = Logger::new(directory.to_path_buf());
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        let level = if cfg!(debug_assertions) {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        };
        log::set_max_level(level);
        log::info!("BrowserHub logging initialized at {}", directory.display());
    }
}

fn prune_old_logs(directory: &Path, keep_days: u64) {
    let threshold = SystemTime::now()
        .checked_sub(Duration::from_secs(keep_days * 24 * 60 * 60))
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_log = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with("browserhub-") && name.ends_with(".log"))
            .unwrap_or(false);
        if !is_log {
            continue;
        }
        let expired = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .map(|modified| modified < threshold)
            .unwrap_or(false);
        if expired {
            let _ = fs::remove_file(path);
        }
    }
}

#[allow(dead_code)]
pub fn level_label(level: Level) -> &'static str {
    match level {
        Level::Error => "ERROR",
        Level::Warn => "WARN",
        Level::Info => "INFO",
        Level::Debug => "DEBUG",
        Level::Trace => "TRACE",
    }
}
