# BrowserHub 开发/验证脚本

统一存放本项目使用过的脚本。命名规范：`<阶段>-<动作>.<ext>`。
按时间顺序排列，可侧面还原整个开发过程做了什么。

## 分支与发布

- `internal`（默认工作分支）：包含 `docs/`（心路历程、ADR、验证记录），**永不 push**。
- `main`：公开分支，**不含 docs/**，推送到远端。
- 发布流程：`npm run sync-main`（internal → main 快进合并并移除 docs → push 由你手动确认后执行）。
- 提交照常在 internal 上做；合并是快进式的，不会产生额外合并提交。

## 语言选择规范

| 语言 | 用于 | 理由 |
| --- | --- | --- |
| **Node.js (`.cjs`)** | 与前端生态交互（Playwright）、npm script 链路、跨平台发布工具 | 项目本身就是 Node 项目，零新增依赖；`npm run` 直达 |
| **PowerShell (`.ps1`)** | Windows 桌面自动化（窗口点击/截图/进程操作） | 调 Win32 API 最顺手；Windows 自带，目标机器无需装任何东西 |
| **Python** | ❌ 本项目不引入 | 无跨平台/数据处理需求；引入 = 多一个运行时依赖，收益为零 |

规则：**优先复用项目已有的运行时**（Node），只有 Node 做不了/做不好时才引入第二个
（本项目的例外就是 Windows UI 自动化 → PowerShell）。目前 3 个脚本正好各就其位，不需要 Python。

## 前端 / Mock 验证

| 脚本 | 用途 | 运行方式 |
| --- | --- | --- |
| `dev-mock-screenshot.js` | 对 `npm run dev` 的 mock 页面批量截图（环境/备份/设置/新建/引导），输出到 `.screenshots/` | `NODE_PATH=./node_modules node scripts/dev-mock-screenshot.js`（需先启动 dev server） |
| `dev-window-capture.ps1` | 对真实桌面窗口截图 + 可选点击/输入，用于桌面端端到端验证 | `powershell -ExecutionPolicy Bypass -File scripts/dev-window-capture.ps1 -OutName x.png [-ClickDx n -ClickDy n -TypeText "文本"]` |

## 发布 / 安装器

| 脚本 | 用途 | 运行方式 |
| --- | --- | --- |
| `release-collect.cjs` | 收集 tauri build 产物到 `release/v<版本>/`（安装版+便携版），生成含 SHA256 的 `RELEASE.md` | `npm run dist`（构建+收集）或 `node scripts/release-collect.cjs`（仅收集） |

## 验证顺序（复盘用）

1. `dev-mock-screenshot.js` — 前端在浏览器 mock 后端下的渲染与交互（早期，后端未完成时）。
2. `dev-window-capture.ps1` — Rust 后端完成后，针对真实窗口验证：引导流程 → 新建环境 → 启动 Chrome → 关闭 BrowserHub 验证 Chrome 存活 → 重启检测"运行中" → 备份 → 恢复 → 设置页。

## 截图目录

`.screenshots/`（gitignore）。`dev-*` 脚本默认写入该目录。
