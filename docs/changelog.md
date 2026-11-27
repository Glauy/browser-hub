# 变更日志

版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)；格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
当前版本 **0.1.0**（尚未打 git tag，发布产物见 `release/v<版本>/`）。

## [Unreleased]

### 新增（文档）

- `docs/timeline.md`：从 0 到 0.1.0 的阶段时间线、每次架构修正的原因。
- `docs/debug-log-webview2-zombie-freeze.md`：WebView2 僵尸进程故障的完整取证与
  加固待办。

### 已知问题（未修复）

- **WebView2 崩溃后应用"点不开"**：`msedgewebview2.exe` 因 OOM（`0xE0000008`）
  崩溃后，WER 只冻结、不终止进程，留下全线程 `Suspended` 的僵尸。此后
  `show_main_window()` 的同步 `ShowWindow(SW_SHOW)` 会永久阻塞，托盘、关闭、
  单实例激活全部失效；重启 exe 也会卡在同一步。
  - 影响版本：0.1.0
  - 临时恢复：结束 `browserhub.exe` 后重启（不影响 Chrome 环境）
  - 详见：[debug-log-webview2-zombie-freeze.md](debug-log-webview2-zombie-freeze.md)

## [0.1.0] - 2026-11-15

首个可用版本：Windows 桌面端（Tauri 2 + React/TypeScript + Rust + SQLite），
本地优先，SQLite 只存元数据，绝不读取 Cookies/密码。

### 新增

- **环境管理**：一个环境 = 一个独立的 Chrome User Data Directory；新建、导入
  （只引用不复制）、重命名/备注、删除（运行中禁止，二次确认展示完整路径）。
- **启动与状态**：按 `--user-data-dir` 精确匹配进程（ToolHelp +
  `NtQueryInformationProcess`），不按 `chrome.exe` 名称判断；无法确定时标
  `unknown` 并禁止破坏性操作；绝不 force-kill Chrome。
- **备份/恢复**：完整目录副本、恢复前覆盖确认；运行中或 `unknown` 时禁止操作。
- **系统默认 Chrome 托管**：`env_default` 作为系统默认形态，junction
  `User Data → env_default`；支持接管、复制现有数据、还原；原数据改名
  `User Data.account0.bak` 保留可逆。系统默认行作为列表首行展示。
- **浏览器配置**：Chrome 自动检测（常见路径 + 注册表 App Paths）、手动指定。
- **设置与引导**：首次引导；环境根目录、备份根目录、关闭行为、开机自启；
  `ApiResult<T>` 统一返回（`success/data/error{code,message}`）与稳定错误码。
- **桌面集成**：无边框自绘标题栏；窗口位置/尺寸/最大化持久化；系统托盘
  （左键恢复、右键菜单、tooltip）；单实例互斥。
- **数据与日志**：SQLite（migration v1→v2）；按天日志；配置损坏自动隔离并回退。
- **安装与发布**：自定义 NSIS（当前用户安装、可选目录、卸载默认保留数据）；
  `npm run dist` 生成 `release/v<版本>/`（安装版 + 便携版 + `RELEASE.md` SHA256 清单）。

### 变更

- 数据根目录从 `%LOCALAPPDATA%\BrowserHub` 迁移到
  `%LOCALAPPDATA%\forga.space\BrowserHub`（旧数据自动迁移，0.93GB 实测无感）。
- WebView2 用户数据目录固定到 `forga.space\BrowserHub\webview`，与程序、业务数据
  三者分离；多产品不共享 WebView2 UDF。
- 窗口创建改为 `create: false` + `WebviewWindowBuilder::from_config(...)`
  + `data_directory(...)`，解决 `a webview with label 'main' already exists`。
- 关闭/最小化统一为**隐藏到托盘**（任务栏不留图标）；设置项 `closeBehavior`
  默认 `minimize`，移除冗余的 `minimizeToTray` 开关。
- 单实例、托盘、窗口状态、开机自启均自行实现，不引入 Tauri 插件（离线构建约束）。
- `identifier` 定为 `space.forga.browserhub`（身份值，不再派生磁盘目录）。

### 修复

- WebView 重复创建导致启动失败（`create: false` + 显式 `data_directory`）。
- 配置文件被写坏（PS 5.1 BOM）时启动崩溃 → 改为隔离损坏文件并回退默认值。
- `sync-main` 切换分支后丢失 `README.public.md`、重复运行产生多余提交、
  推送 non-fast-forward → v3 自愈 + 强制推送前读取 + `--force-with-lease`。
- 托盘隐藏验证中的窗口状态漂移、exe 未重编译等验证陷阱（记录于
  `debug-log-tray-verification.md`）。

### 文档

- `architecture.md`、`data-and-safety.md`、`development.md`、
  `verification.md`、`bundle-size.md`、`app-data-vs-webview.md`、
  `multi-product-webview-udf-policy.md`、`user-data-forms.md`。
- ADR：[0001 安装器程序/数据分离](decisions/0001-installer-separate-program-and-data.md)、
  [0002 forga.space 数据布局与 WebView2 收纳](decisions/0002-forga-space-data-layout.md)。
- `scripts/README.md`：脚本语言规范、PS 5.1 编码铁律、UI 自动化局限、分支发布流程。

### 已知限制

- 多环境并发检测、`unknown` 状态的真实触发路径、自启开关的注册表实测未覆盖。
- 系统默认托管的 UI 按钮点击未做自动化验证（后端逻辑已等价验证）。
- 已弃用但保留：数据库字段 `is_default_profile`。
- 发布 exe 约 4.9MB（LTO + strip），安装包约 1.9MiB。
