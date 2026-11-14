# 架构

## 目录

```
src/                  前端（React + TS）
  app/                App 组装、导航
  components/         UI 原语（Button/Dialog/Toast…）与布局
  features/           按领域分页：environments / backups / settings / onboarding
  hooks/              数据 hook（useBootstrap/useEnvironments/useBackups）
  lib/                ipc.ts（唯一 IPC 边界）、mock.ts（开发 mock）
  types/              与 Rust 对齐的接口定义
src-tauri/            后端（Rust）
  src/
    errors.rs         ApiResult/AppError：稳定错误码 + 中文用户消息
    models.rs         前后端共享模型（camelCase serde）
    state.rs          AppState：Mutex<Database> + RwLock<AppSettings>
    database/         SQLite FFI 封装 + migrations + 三个仓储（browsers/environments/backups）
    services/         业务：environment / backup / chrome / process / filesystem / platform / settings_store / logging / app_paths
    commands/         薄命令层：settings / environments / browsers / backups / window
    window.rs tray.rs 窗口状态、关闭行为、托盘
```

## 前后端边界（核心规则）

- 前端**禁止**直接访问文件系统/进程；一切通过 `lib/ipc.ts` 的 `call<T>(command, args)`。
- Rust 命令统一返回 `ApiResult<T>`：`{ success, data?, error?: { code, message } }`。
  成功时 `data` 恒为 `Some`（含 `null`），失败时省略 `data`；`message` 是可直接展示的中文，原始系统错误只进本地日志。
- 耗时操作（目录扫描、备份、对话框）走 `api_blocking`（spawn_blocking），不阻塞 UI 线程。
- 开发期 mock（`lib/mock.ts`）命令名与参数必须与 Rust 完全一致，仅 `import.meta.env.DEV` 加载。

## IPC 命令清单（32 个）

设置/引导：`get_bootstrap_state` `get_app_settings` `update_app_settings` `complete_setup` `select_directory` `select_executable` `get_storage_info` `inspect_environment_directory` `open_directory`
环境：`list_environments` `create_environment` `import_environment` `update_environment` `remove_environment` `delete_environment` `launch_environment` `get_environment_status` `refresh_environment_status` `get_environment_stats`
浏览器：`get_browser_configs` `detect_chrome` `create_browser_config` `update_browser_config` `delete_browser_config`
备份：`backup_environment` `list_backups` `restore_environment` `delete_backup`
窗口：`window_minimize` `window_toggle_maximize` `window_is_maximized` `window_close`

参数均为 camelCase（Tauri 2 默认），`{ input }` 结构体或 `{ environmentId }` 等标量。

## 关键设计

- **路径即身份**：环境保存完整绝对 `userDataDir`，改根目录只影响新建环境；重命名/移动靠备份恢复流程，永不自动重建路径。
- **状态检测**：`refresh_environment_status` 用 ToolHelp 快照枚举 chrome.exe，`NtQueryInformationProcess(60)` 读命令行精确匹配 `--user-data-dir`；读不到命令行时回退 PID+启动时间+映像名；仍不确定则报 `unknown`，拒绝启动/删除/备份。
- **数据库**：`libsqlite3-sys` bundled + 薄 FFI 封装（WAL、busy_timeout、外键），迁移按 `user_version` 事务执行。
- **关闭行为**：`exit` 直接退出 / `minimize` 隐藏到托盘；托盘"退出"强制真退出；任何路径都不结束 Chrome。
