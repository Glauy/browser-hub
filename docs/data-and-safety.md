# 数据与安全

## 数据存放

| 内容 | 位置 |
| --- | --- |
| 元数据库 | `%LOCALAPPDATA%\forga.space\BrowserHub\manager.db`（SQLite/WAL） |
| 应用设置 | `%LOCALAPPDATA%\forga.space\BrowserHub\config.json`（损坏时自动隔离并尝试 .bak 恢复） |
| 日志 | `%LOCALAPPDATA%\forga.space\BrowserHub\logs\`（按天，保留 7 天，仅本地） |
| 窗口状态 | `%LOCALAPPDATA%\forga.space\BrowserHub\window-state.json` |
| WebView2 缓存 | `%LOCALAPPDATA%\forga.space\BrowserHub\webview\EBWebView`（引擎缓存，可重建；见 ADR-0002） |
| 系统默认 Chrome 数据 | `D:\BrowserProfiles\env_default`（junction 托管，见 user-data-forms.md） |
| 环境根目录 | 默认 `D:\BrowserProfiles`（可改，绝不硬编码依赖） |
| 备份目录 | 默认 `<环境根目录>\backups`（可改） |

> 产品根唯一原则：BrowserHub 在 `%LOCALAPPDATA%` 下只占 `forga.space\BrowserHub` 一个目录（程序在
> `%LOCALAPPDATA%\Programs\BrowserHub`，属安装器管理，见 ADR-0001/0002）。旧版遗留目录
> （`%LOCALAPPDATA%\BrowserHub`、`%LOCALAPPDATA%\com.browserhub.desktop`）由启动迁移和卸载钩子兜底清理。

## 两种用户数据形态（详见 user-data-forms.md）

| 形态 | 目录 | 入口 |
| --- | --- | --- |
| 系统默认 Chrome | `env_default`（junction 托管） | 双击图标 / 其他程序链接 / 列表"启动" |
| BrowserHub 环境 | `env_<id>`（`--user-data-dir` 直连） | 仅 BrowserHub 环境列表 |

两者可同时运行（Chrome 多实例引擎），互不影响。`env_default` 不参与环境切换、
不可删除；接管时原 Chrome 数据保存于 `User Data.account0.bak`，一键可还原。

## 红线（实现与后续改动都必须遵守）

1. SQLite/日志只存元数据（名称、路径、时间、PID）；**永不**读取 Cookies/密码/历史内容，日志不得出现浏览数据。
2. 同一 `userDataDir` 不允许绑定两个环境；启动前精确匹配命令行防重复启动。
3. 状态为 `running` 或 `unknown` 时拒绝：删除、备份、恢复。`unknown` 同时拒绝启动。
4. 永不 force-kill Chrome；BrowserHub 退出/崩溃不影响已启动的 Chrome。
5. 破坏性删除前：显示完整路径 + 文本确认勾选（前端）+ 后端再校验。后端守则：拒绝磁盘根目录、Windows/Program Files、用户配置目录、应用数据、备份目录、与其他环境路径重叠、符号链接/联接点（含子项）。
6. 恢复备份 = 现目录改名到兄弟临时位 → 复制备份 → 失败回滚改名 → 成功后才删临时位。
7. 备份前检查磁盘剩余空间（数据量 + 32MB 余量）；备份结果为空视为失败并清理。

## Chrome 检测顺序

1. 常见路径：`ProgramFiles` / `ProgramFiles(x86)` / `LOCALAPPDATA` 下的 `Google\Chrome\Application\chrome.exe`
2. 注册表 `App Paths\chrome.exe`（HKCU/HKLM × 64/32 位视图）
3. 版本：exe 文件版本资源 → 安装目录 `x.y.z.w` 子目录 → 注册表 `BLBeacon\version`

## 开机自启

`HKCU\...\CurrentVersion\Run` 值 `BrowserHub`，内容为带引号的当前 exe 路径；设置开关时同步注册表。
