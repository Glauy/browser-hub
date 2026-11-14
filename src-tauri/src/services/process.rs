use crate::models::{
    now_iso, EnvironmentRecord, EnvironmentStatus, EnvironmentStatusInfo,
};
use crate::services::app_paths::normalized_key;
use std::path::Path;
use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::System::Threading::{
    GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};

const PROCESS_COMMAND_LINE_INFORMATION: u32 = 60;

#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum_length: u16,
    buffer: *mut u16,
}

#[link(name = "ntdll")]
extern "system" {
    fn NtQueryInformationProcess(
        process_handle: HANDLE,
        process_information_class: u32,
        process_information: *mut std::ffi::c_void,
        process_information_length: u32,
        return_length: *mut u32,
    ) -> i32;
}

#[derive(Debug, Clone)]
pub struct ChromeProcess {
    pub pid: u32,
    pub is_chrome_child: bool,
    pub command_line: Option<String>,
    pub user_data_dir: Option<String>,
    pub started_at: Option<i64>,
}

fn filetime_to_i64(time: FILETIME) -> i64 {
    (((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64) as i64
}

fn query_command_line(handle: HANDLE) -> Option<String> {
    // UNICODE_STRING plus the character buffer that follows it. 64K u16 units
    // covers the Windows command-line limit with headroom.
    let mut buffer = vec![0u64; 16 * 1024];
    let mut return_length = 0u32;
    let byte_length = (buffer.len() * std::mem::size_of::<u64>()) as u32;
    let status = unsafe {
        NtQueryInformationProcess(
            handle,
            PROCESS_COMMAND_LINE_INFORMATION,
            buffer.as_mut_ptr().cast(),
            byte_length,
            &mut return_length,
        )
    };
    if status < 0 {
        return None;
    }

    let unicode = unsafe { &*(buffer.as_ptr() as *const UnicodeString) };
    let base = buffer.as_ptr() as usize;
    let data = unicode.buffer as usize;
    let length = unicode.length as usize;
    if unicode.buffer.is_null() || length == 0 || length % 2 != 0 {
        return None;
    }
    let end = data.checked_add(length)?;
    if data < base || end > base + byte_length as usize {
        return None;
    }
    let units = unsafe { std::slice::from_raw_parts(unicode.buffer, length / 2) };
    let command_line = String::from_utf16_lossy(units);
    let trimmed = command_line.trim_end_matches('\0').trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Splits a Windows command line into arguments, honoring double quotes.
/// Chrome may be started either as `--user-data-dir="C:\a b"` or with the
/// whole argument quoted by the process launcher.
fn split_windows_arguments(command_line: &str) -> Vec<String> {
    let mut arguments = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut characters = command_line.chars().peekable();

    while let Some(character) = characters.next() {
        match character {
            '"' => in_quotes = !in_quotes,
            '\\' if characters.peek() == Some(&'"') => {
                current.push('"');
                characters.next();
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    arguments.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }
    if !current.is_empty() {
        arguments.push(current);
    }
    arguments
}

pub fn user_data_dir_from_command_line(command_line: &str) -> Option<String> {
    split_windows_arguments(command_line)
        .into_iter()
        .find_map(|argument| {
            let lower = argument.to_ascii_lowercase();
            let prefix = "--user-data-dir=";
            if lower.starts_with(prefix) {
                let value = argument[prefix.len()..].trim().trim_matches('"').trim();
                if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                }
            } else {
                None
            }
        })
}

pub fn process_start_time(pid: u32) -> Option<i64> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return None;
    }
    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let mut exit = creation;
    let mut kernel = creation;
    let mut user = creation;
    let ok = unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) };
    unsafe {
        CloseHandle(handle);
    }
    if ok == 0 {
        None
    } else {
        Some(filetime_to_i64(creation))
    }
}

fn process_image_name(handle: HANDLE) -> Option<String> {
    let mut buffer = vec![0u16; 1024];
    let mut size = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size) };
    if ok == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(&buffer[..size as usize]))
}

/// Enumerates every chrome.exe process. Command lines are read with
/// NtQueryInformationProcess so environments are matched by their exact
/// `--user-data-dir`, never by executable name alone.
pub fn scan_chrome_processes() -> Result<Vec<ChromeProcess>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot.is_null() || snapshot == windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE {
        return Err("无法枚举系统进程。".to_string());
    }

    let mut entries: Vec<PROCESSENTRY32W> = Vec::new();
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let mut has_entry = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    while has_entry {
        entries.push(entry);
        entry = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        has_entry = unsafe { Process32NextW(snapshot, &mut entry) } != 0;
    }
    unsafe {
        CloseHandle(snapshot);
    }

    let is_chrome_name = |entry: &PROCESSENTRY32W| {
        let name = crate::services::platform::from_wide_buffer(&entry.szExeFile);
        name.eq_ignore_ascii_case("chrome.exe")
    };

    let chrome_pids: std::collections::HashSet<u32> = entries
        .iter()
        .filter(|entry| is_chrome_name(entry))
        .map(|entry| entry.th32ProcessID)
        .collect();

    let mut processes = Vec::new();
    for entry in entries.iter().filter(|entry| is_chrome_name(entry)) {
        let pid = entry.th32ProcessID;
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        let (command_line, started_at, executable_matches) = if handle.is_null() {
            (None, None, true)
        } else {
            let command_line = query_command_line(handle);
            let mut creation = FILETIME {
                dwLowDateTime: 0,
                dwHighDateTime: 0,
            };
            let mut exit = creation;
            let mut kernel = creation;
            let mut user = creation;
            let times_ok = unsafe {
                GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user)
            } != 0;
            let image = process_image_name(handle);
            unsafe {
                CloseHandle(handle);
            }
            let executable_matches = image
                .map(|value| {
                    Path::new(&value)
                        .file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| name.eq_ignore_ascii_case("chrome.exe"))
                        .unwrap_or(false)
                })
                .unwrap_or(true);
            (
                command_line,
                if times_ok {
                    Some(filetime_to_i64(creation))
                } else {
                    None
                },
                executable_matches,
            )
        };

        if !executable_matches {
            continue;
        }

        let user_data_dir = command_line
            .as_deref()
            .and_then(user_data_dir_from_command_line);

        processes.push(ChromeProcess {
            pid,
            is_chrome_child: chrome_pids.contains(&entry.th32ParentProcessID),
            command_line,
            user_data_dir,
            started_at,
        });
    }

    Ok(processes)
}

fn same_directory(left: &str, right: &str) -> bool {
    normalized_key(Path::new(left)) == normalized_key(Path::new(right))
}

fn reliable_status(
    record: &EnvironmentRecord,
    status: EnvironmentStatus,
    pid: Option<u32>,
    reason: Option<String>,
) -> EnvironmentStatusInfo {
    EnvironmentStatusInfo {
        environment_id: record.environment.id.clone(),
        status,
        pid,
        checked_at: now_iso(),
        reliable: true,
        reason,
    }
}

pub fn evaluate_status(
    record: &EnvironmentRecord,
    processes: &[ChromeProcess],
) -> EnvironmentStatusInfo {
    let environment = &record.environment;

    let mut matching: Vec<&ChromeProcess> = processes
        .iter()
        .filter(|process| {
            process
                .user_data_dir
                .as_deref()
                .map(|directory| same_directory(directory, &environment.user_data_dir))
                .unwrap_or(false)
        })
        .collect();

    if !matching.is_empty() {
        matching.sort_by_key(|process| process.is_chrome_child);
        let browser = matching
            .iter()
            .find(|process| {
                process
                    .command_line
                    .as_deref()
                    .map(|line| !line.to_ascii_lowercase().contains("--type="))
                    .unwrap_or(false)
            })
            .copied()
            .or_else(|| matching.first().copied());
        return reliable_status(
            record,
            EnvironmentStatus::Running,
            browser.map(|process| process.pid),
            None,
        );
    }

    if let Some(tracked_pid) = record.last_pid {
        if let Some(process) = processes.iter().find(|process| process.pid == tracked_pid) {
            let identity_matches = match (record.last_pid_started_at, process.started_at) {
                (Some(expected), Some(actual)) => expected == actual,
                (None, _) => true,
                (Some(_), None) => false,
            };
            if identity_matches {
                return reliable_status(
                    record,
                    EnvironmentStatus::Running,
                    Some(process.pid),
                    None,
                );
            }
        }
    }

    if processes
        .iter()
        .any(|process| process.command_line.is_none())
    {
        return EnvironmentStatusInfo::unknown(
            environment.id.clone(),
            "有 Chrome 进程的命令行无法读取，暂时无法确认该环境是否在运行。",
        );
    }

    if !Path::new(&environment.user_data_dir).is_dir() {
        return reliable_status(
            record,
            EnvironmentStatus::Error,
            None,
            Some("环境目录不存在，可能已被移动或删除。".to_string()),
        );
    }

    reliable_status(record, EnvironmentStatus::Stopped, None, None)
}

pub fn all_unknown(
    records: &[EnvironmentRecord],
    reason: &str,
) -> Vec<EnvironmentStatusInfo> {
    records
        .iter()
        .map(|record| EnvironmentStatusInfo::unknown(record.environment.id.clone(), reason))
        .collect()
}
