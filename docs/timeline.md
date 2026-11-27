# 项目时间线

> 目的：按时间还原 BrowserHub 从 0 到 0.1.1 的过程、每次架构修正的原因，以及
> 真实使用后发生的第一个线上级故障。与 `changelog.md`（版本视角）互补：
> 本文回答"为什么变成现在这样"，changelog 回答"每个版本有什么"。
>
> 时间来源：应用日志（`%LOCALAPPDATA%\forga.space\BrowserHub\logs\`）、
> git 提交时间、WER/事件日志。应用日志为本地时间（UTC+8）。

## 阶段总览

| 时间 | 阶段 | 关键结果 |
| --- | --- | --- |
| 2026-11-14 晚 | 从零到可运行 | 环境 CRUD / 启动 / 状态 / 备份恢复全部跑通 |
| 2026-11-15 凌晨 | 数据布局与窗口模型修正 | 数据目录迁到 `forga.space`；`create:false` 修 WebView 重复；DB v2 |
| 2026-11-15 上午 | 系统默认托管 + 发布流程 | `env_default` junction 托管；internal/main 分支模型；sync 脚本 |
| 2026-11-15 上午 | 隐藏到托盘 + 首次发布 | 关闭/最小化统一隐藏；`release/v0.1.0`；GitHub main |
| 2026-11-15 → 11-20 | 真实使用 | 多环境日常启动，未改代码 |
| 2026-11-22 | **首次线上级故障** | WebView2 OOM 崩溃 → WER 冻结 → 应用"点不开" |
| 2026-11-27 | 故障定位、修复与 0.1.1 打包 | 定位 `ShowWindow` 阻塞链；加固并实测；托盘菜单重构 |

## 详细

### 2026-11-14 22:46–23:17　从零到可运行

首版（Tauri 2 + React/TS + Rust + SQLite）在一天内跑通主链路：

| 时间 | 事件 |
| --- | --- |
| 22:46:56 | 首次启动，创建数据库（migration v1）、日志目录 |
| 22:47:15 | 首次引导完成（Chrome 检测、环境根目录/备份目录） |
| 22:57:55 | 创建 `env_701b319a0509` |
| 22:58:11 | 启动 Chrome（pid 34852，`--user-data-dir` 直连） |
| 23:00:49 | 备份：487 文件 / 66.4MB |
| 23:01:42 | 恢复成功（覆盖确认） |
| 23:17:59 | 再次启动环境（pid 30684） |

此时数据目录还是 `%LOCALAPPDATA%\BrowserHub`。

### 2026-11-15 01:29–03:30　数据布局与窗口模型修正

| 时间 | 事件 | 原因/结果 |
| --- | --- | --- |
| 01:29:55 | 数据根切换到 `%LOCALAPPDATA%\forga.space\BrowserHub` | 多产品命名空间；旧目录 0.93GB 无感迁移 |
| 02:01–02:02 | 连续两次 `UI initialization failed: a webview with label 'main' already exists` | 最终改为 `create: false` + `WebviewWindowBuilder::from_config(...).data_directory(...)` |
| 03:20:08 | 创建 `env_659b46cc6bc9`（沿用至今） | — |
| 03:23:19 | 永久删除 `env_701b319a0509` 及其备份 | 验证破坏性删除路径 |
| 03:27 | 首个 git 提交 `7202292`（v0.1.0 全量） | 仓库初始化较晚，此前工作一次性入库 |
| 03:38 | `bad1790` 撤销 docs 的 `.gitignore` | 确立"docs 走 internal 分支隔离，而不是忽略" |
| 03:39 | `456cdca` 新增 `sync-main` 脚本 | internal → main 的裁剪发布 |

### 2026-11-15 04:41–06:55　DB v2 + 系统默认托管 + 发布链路

| 时间 | 事件 | 说明 |
| --- | --- | --- |
| 04:41 | 数据库迁移 v2 | 增加 `is_default_profile`（后弃用但保留） |
| 05:48–06:07 | 系统默认 Chrome 托管实测 | junction `User Data → env_default`；无参启动 Chrome 17 进程 / 105 文件写入 |
| 06:13 | `910d291` 系统默认行成为一等公民 | 列表首行、🏠 徽标、托管/同步/还原 |
| 06:20 | `13aedb9` `user-data-forms.md` | 固化 `env_default` 与 `env_*` 双形态模型 |
| 06:29 | `556e95d` 公共分支发布流程 | `README.public.md` 作为对外 README 源头 |
| 06:33 | `0945480` sync 补剥离 `README.public.md` | — |
| 06:45 | `37905fe` sync v3 自愈 | 自动切 internal、`reset --hard` main、切换前读入 public README |
| 06:55 | `38e5db0` 清理误提交的杂散文件 `0` | — |

### 2026-11-15 07:00–08:00　隐藏到托盘 + 首次发布

| 时间 | 事件 | 说明 |
| --- | --- | --- |
| 07:18–07:39 | 关闭/最小化行为改造与验证 | `window.rs::minimize` 永远 `hide()`；设置页移除冗余开关；默认 `closeBehavior=minimize` |
| 07:39:35 | 日志实证：`firing minimize()` → `visible after minimize = false` | 绕开不可靠的 UI 点击自动化 |
| 07:43 | `a2a5271` hide-to-tray | 托盘左键恢复、右键菜单、tooltip |
| 07:47 | 发布 `release/v0.1.0`（安装版 + 便携版 + SHA256 清单） | NSIS 自定义模板 |
| 07:48 | `a7c17b1` 调试复盘 + 脚本规范 | 见 `debug-log-tray-verification.md` |
| 07:52 | `2308d9f` sync 改用 `--force-with-lease` | main 每次重建，哈希必然分叉 |
| 08:0x | `main` 推送 GitHub（`30f08e1`） | 文件树 11 项，无 docs/vibe/内部 README |

### 2026-11-15 09:33–11-20　真实使用

| 时间 | 事件 |
| --- | --- |
| 11-15 09:33:00 | 启动系统默认 Chrome（pid 18424） |
| 11-16 03:01:46 | 启动 `env_659b46cc6bc9`（pid 2552） |
| 11-18 21:19:14 | 启动 `env_659b46cc6bc9`（pid 30312） |
| 11-20 05:06–05:07 | 创建并启动 `env_d53f68baaba7`（pid 18848） |
| 11-20 07:48:22 | **最后一次正常日志**：启动 `env_659b46cc6bc9`（pid 32364） |

期间代码零改动；应用以托盘常驻方式运行。

### 2026-11-22 15:50　首次线上级故障（WebView2 僵尸化）

| 时间 | 事件 |
| --- | --- |
| 15:32:34 | WebView2 浏览器进程（pid 32148）仍在正常创建线程 |
| **15:50:08** | 该进程以 `0xE0000008`（Chromium OOM 终止码）崩溃，模块 `KERNELBASE.dll+0x25369` |
| 15:50:10 | WER 报告归档；进程被冻结（52/52 线程 Suspended）但**未被终止** |
| 之后某次 | 托盘"显示窗口" → `ShowWindow` 永久阻塞；窗口再未出现，托盘失效，重启 exe 也会卡在同一步 |

同日 11-25 09:06:27，zcode-switch 的 WebView2 与 Chrome GPU 进程也以相同异常码
崩溃并留下同样冻结的进程，说明这是本机的系统级重复故障（内存压力：16GB 物理 /
27GB 提交），不是 BrowserHub 独有。

### 2026-11-27　故障定位、修复与文档沉淀

| 时间 | 事件 |
| --- | --- |
| 08:32 | 只读取证：主线程 `NtUserShowWindow(SW_SHOW)`；WebView2 子窗口 2s 超时；52/52 Suspended |
| 08:xx | WER `AppSessionGuid` 反解确认崩溃实例 = pid 32148 |
| 09:00–09:25 | 实现并实测加固：显示前健康检查、僵尸自动重启、单实例命名事件、启动清理孤儿 WebView2、看门狗、托盘重启/退出 |
| 09:29 | **0.1.1**：托盘菜单重构（去重产品名、分隔线、默认项加粗、tooltip）；版本号三处同步 |
| 09:40 | `npm run dist` 产出 `release/v0.1.1/`（**只打包，未安装、未改动安装目录**） |
| 同日 | 新增 `docs/debug-log-webview2-zombie-freeze.md`、`docs/timeline.md`、`docs/changelog.md` |

## 版本与分支节奏

- **版本**：当前 `0.1.1`，未打 git tag；发布产物在 `release/v0.1.1/`
  （0.1.0 的产物仍在 `release/v0.1.0/`）。
- **分支**：`internal` 是唯一工作分支（含 docs、`vibe coding.md`、`README.public.md`），
  **永不 push**；`main` 每次由 `npm run sync-main` 从 internal 重建并裁剪，
  通过 `--force-with-lease` 推送。
- **发布**：`npm run dist` → 构建 + 收集到 `release/v<版本>/` + `RELEASE.md`（SHA256）。
- **文档**：`docs/` 只存在于 internal；对外只保留 `README.public.md` 生成的产品页 README。
