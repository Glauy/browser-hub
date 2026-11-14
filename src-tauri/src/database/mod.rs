use crate::errors::{AppError, AppResult};
use libsqlite3_sys as ffi;
use std::ffi::{CStr, CString};
use std::path::Path;
use std::ptr;
use std::slice;

pub mod backups;
pub mod browsers;
pub mod environments;
pub mod migrations;

#[derive(Debug, Clone, PartialEq)]
pub enum SqlValue {
    Null,
    Integer(i64),
    Text(String),
}

impl From<&str> for SqlValue {
    fn from(value: &str) -> Self {
        Self::Text(value.to_string())
    }
}

impl From<String> for SqlValue {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<&String> for SqlValue {
    fn from(value: &String) -> Self {
        Self::Text(value.clone())
    }
}

impl From<Option<String>> for SqlValue {
    fn from(value: Option<String>) -> Self {
        match value {
            Some(value) => Self::Text(value),
            None => Self::Null,
        }
    }
}

impl From<Option<&str>> for SqlValue {
    fn from(value: Option<&str>) -> Self {
        match value {
            Some(value) => Self::Text(value.to_string()),
            None => Self::Null,
        }
    }
}

impl From<i64> for SqlValue {
    fn from(value: i64) -> Self {
        Self::Integer(value)
    }
}

impl From<i32> for SqlValue {
    fn from(value: i32) -> Self {
        Self::Integer(value as i64)
    }
}

impl From<Option<i64>> for SqlValue {
    fn from(value: Option<i64>) -> Self {
        match value {
            Some(value) => Self::Integer(value),
            None => Self::Null,
        }
    }
}

impl From<Option<i32>> for SqlValue {
    fn from(value: Option<i32>) -> Self {
        match value {
            Some(value) => Self::Integer(value as i64),
            None => Self::Null,
        }
    }
}

impl SqlValue {
    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(value) => Some(value),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Integer(value) => Some(*value),
            Self::Text(value) => value.parse().ok(),
            Self::Null => None,
        }
    }

}

#[derive(Debug)]
pub struct DbError {
    pub message: String,
    pub extended_code: i32,
}

impl DbError {
    pub fn is_unique_violation(&self) -> bool {
        self.extended_code == 2067
            || self.extended_code == 1555
            || self.message.contains("UNIQUE constraint failed")
    }

}

pub struct Database {
    handle: *mut ffi::sqlite3,
}

// Access is serialized by the AppState mutex.
unsafe impl Send for Database {}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| AppError::io("无法创建数据库目录", error))?;
        }

        let path_string = path.to_string_lossy().to_string();
        let path_c = CString::new(path_string.as_bytes()).map_err(|_| {
            AppError::new("DATABASE_ERROR", "数据库路径包含无效字符。")
        })?;

        let mut handle = ptr::null_mut();
        let flags = ffi::SQLITE_OPEN_READWRITE | ffi::SQLITE_OPEN_CREATE | 0x0001_0000;
        let result = unsafe { ffi::sqlite3_open_v2(path_c.as_ptr(), &mut handle, flags, ptr::null()) };
        if result != ffi::SQLITE_OK {
            let message = if handle.is_null() {
                format!("sqlite3_open_v2 failed with code {result}")
            } else {
                unsafe {
                    let msg = ffi::sqlite3_errmsg(handle);
                    if msg.is_null() {
                        format!("sqlite3_open_v2 failed with code {result}")
                    } else {
                        CStr::from_ptr(msg).to_string_lossy().into_owned()
                    }
                }
            };
            if !handle.is_null() {
                unsafe {
                    ffi::sqlite3_close(handle);
                }
            }
            return Err(AppError::with_detail(
                "DATABASE_ERROR",
                "无法打开 BrowserHub 元数据数据库。请检查应用数据目录权限。",
                message,
            ));
        }

        let mut database = Self { handle };
        unsafe {
            ffi::sqlite3_extended_result_codes(database.handle, 1);
            ffi::sqlite3_busy_timeout(database.handle, 5000);
            ffi::sqlite3_enable_load_extension(database.handle, 0);
        }

        database.execute_script(
            "PRAGMA journal_mode = WAL;\n\
             PRAGMA synchronous = NORMAL;\n\
             PRAGMA foreign_keys = ON;\n\
             PRAGMA busy_timeout = 5000;",
        )?;

        migrations::run(&mut database)?;

        Ok(database)
    }

    pub fn execute_script(&self, sql: &str) -> AppResult<()> {
        let sql_c = CString::new(sql).map_err(|_| {
            AppError::new("DATABASE_ERROR", "数据库脚本包含无效字符。")
        })?;
        let mut error_message: *mut std::ffi::c_char = ptr::null_mut();
        let result = unsafe {
            ffi::sqlite3_exec(
                self.handle,
                sql_c.as_ptr(),
                None,
                ptr::null_mut(),
                &mut error_message,
            )
        };
        if result != ffi::SQLITE_OK {
            let detail = if error_message.is_null() {
                self.error_message()
            } else {
                let message = unsafe { CStr::from_ptr(error_message) }
                    .to_string_lossy()
                    .into_owned();
                unsafe {
                    ffi::sqlite3_free(error_message.cast());
                }
                message
            };
            return Err(AppError::with_detail(
                "DATABASE_ERROR",
                "数据库操作失败，请重试。",
                detail,
            ));
        }
        Ok(())
    }

    pub fn execute(&mut self, sql: &str, params: &[SqlValue]) -> Result<usize, DbError> {
        let changes = {
            let mut statement = self.prepare(sql)?;
            statement.bind(params)?;
            while statement.step()? {}
            drop(statement);
            unsafe { ffi::sqlite3_changes(self.handle) }
        };
        Ok(changes.max(0) as usize)
    }

    pub fn query(&mut self, sql: &str, params: &[SqlValue]) -> Result<Vec<Vec<SqlValue>>, DbError> {
        let mut statement = self.prepare(sql)?;
        statement.bind(params)?;
        let column_count = statement.column_count();
        let mut rows = Vec::new();
        while statement.step()? {
            let mut row = Vec::with_capacity(column_count as usize);
            for column in 0..column_count {
                row.push(statement.column(column));
            }
            rows.push(row);
        }
        Ok(rows)
    }

    pub fn query_one(
        &mut self,
        sql: &str,
        params: &[SqlValue],
    ) -> Result<Option<Vec<SqlValue>>, DbError> {
        Ok(self.query(sql, params)?.into_iter().next())
    }

    pub fn query_count(&mut self, sql: &str, params: &[SqlValue]) -> Result<i64, DbError> {
        Ok(self
            .query_one(sql, params)?
            .and_then(|row| row.first().and_then(SqlValue::as_i64))
            .unwrap_or(0))
    }

    pub fn user_version(&mut self) -> Result<i64, DbError> {
        Ok(self
            .query_one("PRAGMA user_version;", &[])?
            .and_then(|row| row.first().and_then(SqlValue::as_i64))
            .unwrap_or(0))
    }

    pub fn set_user_version(&mut self, version: i64) -> Result<(), DbError> {
        self.execute(&format!("PRAGMA user_version = {version};"), &[])?;
        Ok(())
    }

    pub fn with_transaction<T>(
        &mut self,
        operation: impl FnOnce(&mut Database) -> AppResult<T>,
    ) -> AppResult<T> {
        self.execute_script("BEGIN IMMEDIATE;")?;
        match operation(self) {
            Ok(value) => match self.execute_script("COMMIT;") {
                Ok(()) => Ok(value),
                Err(error) => {
                    let _ = self.execute_script("ROLLBACK;");
                    Err(error)
                }
            },
            Err(error) => {
                let _ = self.execute_script("ROLLBACK;");
                Err(error)
            }
        }
    }

    fn prepare(&mut self, sql: &str) -> Result<Statement<'_>, DbError> {
        let sql_c = CString::new(sql).map_err(|_| DbError {
            message: "SQL contains a NUL byte".to_string(),
            extended_code: ffi::SQLITE_ERROR,
        })?;
        let mut handle = ptr::null_mut();
        let result = unsafe {
            ffi::sqlite3_prepare_v2(
                self.handle,
                sql_c.as_ptr(),
                -1,
                &mut handle,
                ptr::null_mut(),
            )
        };
        if result != ffi::SQLITE_OK {
            return Err(DbError {
                message: self.error_message(),
                extended_code: unsafe { ffi::sqlite3_extended_errcode(self.handle) },
            });
        }
        if handle.is_null() {
            return Err(DbError {
                message: "SQLite returned an empty statement".to_string(),
                extended_code: ffi::SQLITE_ERROR,
            });
        }
        Ok(Statement {
            handle,
            database: self.handle,
            _marker: std::marker::PhantomData,
        })
    }

    fn error_message(&self) -> String {
        unsafe {
            let message = ffi::sqlite3_errmsg(self.handle);
            if message.is_null() {
                "unknown SQLite error".to_string()
            } else {
                CStr::from_ptr(message).to_string_lossy().into_owned()
            }
        }
    }
}

impl Drop for Database {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                ffi::sqlite3_close(self.handle);
            }
            self.handle = ptr::null_mut();
        }
    }
}

struct Statement<'a> {
    handle: *mut ffi::sqlite3_stmt,
    database: *mut ffi::sqlite3,
    _marker: std::marker::PhantomData<&'a mut Database>,
}

impl<'a> Statement<'a> {
    fn bind(&mut self, params: &[SqlValue]) -> Result<(), DbError> {
        for (index, value) in params.iter().enumerate() {
            let position = (index + 1) as i32;
            let result = match value {
                SqlValue::Null => unsafe { ffi::sqlite3_bind_null(self.handle, position) },
                SqlValue::Integer(value) => unsafe {
                    ffi::sqlite3_bind_int64(self.handle, position, *value)
                },
                SqlValue::Text(value) => {
                    let text = CString::new(value.as_str()).map_err(|_| DbError {
                        message: "文本参数包含 NUL 字符".to_string(),
                        extended_code: ffi::SQLITE_ERROR,
                    })?;
                    unsafe {
                        ffi::sqlite3_bind_text(
                            self.handle,
                            position,
                            text.as_ptr(),
                            value.len() as i32,
                            ffi::SQLITE_TRANSIENT(),
                        )
                    }
                }
            };
            if result != ffi::SQLITE_OK {
                return Err(self.error());
            }
        }
        Ok(())
    }

    fn step(&mut self) -> Result<bool, DbError> {
        match unsafe { ffi::sqlite3_step(self.handle) } {
            ffi::SQLITE_ROW => Ok(true),
            ffi::SQLITE_DONE => Ok(false),
            _ => Err(self.error()),
        }
    }

    fn column_count(&self) -> i32 {
        unsafe { ffi::sqlite3_column_count(self.handle) }
    }

    fn column(&self, index: i32) -> SqlValue {
        let kind = unsafe { ffi::sqlite3_column_type(self.handle, index) };
        match kind {
            ffi::SQLITE_INTEGER => SqlValue::Integer(unsafe {
                ffi::sqlite3_column_int64(self.handle, index)
            }),
            ffi::SQLITE_TEXT => {
                let pointer = unsafe { ffi::sqlite3_column_text(self.handle, index) };
                if pointer.is_null() {
                    SqlValue::Null
                } else {
                    let length = unsafe { ffi::sqlite3_column_bytes(self.handle, index) };
                    let bytes = unsafe {
                        slice::from_raw_parts(pointer as *const u8, length.max(0) as usize)
                    };
                    SqlValue::Text(String::from_utf8_lossy(bytes).into_owned())
                }
            }
            ffi::SQLITE_NULL => SqlValue::Null,
            _ => SqlValue::Null,
        }
    }

    fn error(&self) -> DbError {
        let message = unsafe {
            let message = ffi::sqlite3_errmsg(self.database);
            if message.is_null() {
                "unknown SQLite error".to_string()
            } else {
                CStr::from_ptr(message).to_string_lossy().into_owned()
            }
        };
        let code = unsafe { ffi::sqlite3_extended_errcode(self.database) };
        DbError {
            message,
            extended_code: code,
        }
    }
}

impl Drop for Statement<'_> {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe {
                ffi::sqlite3_finalize(self.handle);
            }
            self.handle = ptr::null_mut();
        }
    }
}

pub fn row_text(row: &[SqlValue], index: usize) -> String {
    row.get(index)
        .and_then(SqlValue::as_text)
        .unwrap_or_default()
        .to_string()
}

pub fn row_optional_text(row: &[SqlValue], index: usize) -> Option<String> {
    row.get(index)
        .and_then(SqlValue::as_text)
        .map(|value| value.to_string())
}

pub fn row_i64(row: &[SqlValue], index: usize) -> i64 {
    row.get(index).and_then(SqlValue::as_i64).unwrap_or(0)
}

pub fn row_u32(row: &[SqlValue], index: usize) -> Option<u32> {
    row.get(index)
        .and_then(SqlValue::as_i64)
        .and_then(|value| u32::try_from(value).ok())
}

pub fn row_i64_optional(row: &[SqlValue], index: usize) -> Option<i64> {
    row.get(index).and_then(SqlValue::as_i64)
}

pub fn db_error(context: &str, error: DbError) -> AppError {
    AppError::with_detail(
        "DATABASE_ERROR",
        format!("{context}。请重试，或重新启动 BrowserHub。"),
        error.message,
    )
}

pub fn duplicate_error(context: &str, error: DbError) -> AppError {
    if error.is_unique_violation() {
        AppError::new("ENVIRONMENT_ALREADY_IMPORTED", context)
    } else {
        db_error(context, error)
    }
}
