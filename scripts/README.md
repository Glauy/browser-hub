# BrowserHub 开发/验证脚本

统一存放本项目使用过的脚本。命名规范：`<阶段>-<动作>.<ext>`。
按时间顺序排列，可侧面还原整个开发过程做了什么。

## 语言选择规范

| 语言 | 用于 | 理由 |
| --- | --- | --- |
| **Node.js (`.cjs`)** | 与前端生态交互（Playwright）、npm script 链路、跨平台发布工具 | 项目本身就是 Node 项目，零新增依赖；`npm run` 直达 |
| **PowerShell (`.ps1`)** | Windows 桌面自动化（窗口点击/截图/进程操作） | 调 Win32 API 最顺手；Windows 自带，目标机器无需装任何东西 |
| **Python** | ❌ 本项目不引入 | 无跨平台/数据处理需求；引入 = 多一个运行时依赖，收益为零 |

规则：**优先复用项目已有的运行时**（Node），只有 Node 做不了/做不好时才引入第二个
（本项目的例外就是 Windows UI 自动化 → PowerShell）。目前 3 个脚本正好各就其位，不需要 Python。

**PS 5.1 编码铁律**（三次踩坑）：PS 5.1 将无 BOM 文件按 ANSI 读。凡 `.ps1` 内含中文，
保存为 UTF-8 **带 BOM**；PS 脚本生成 UTF-8 文本文件（json/js/rs）时用
`[System.IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding $false))`，
不用 `Set-Content -Encoding UTF8`（会写 BOM 损坏 shebang/JSON）。

## 分支与发布

- `internal`（默认工作分支）：包含 `docs/`（心路历程、ADR、验证记录）与内部
  README，**永不 push**。
- `main`：公开分支，由 sync 脚本生成——**不含 docs/ 与 vibe coding.md**，
  README 替换为 `README.public.md`（产品页风格）。
- 发布流程：`npm run sync-main`（合并 + 裁剪，不推送）或
  `npm run sync-main -- --push`（合并 + 裁剪 + 推送）。
- `README.public.md`（internal 分支维护）是对外 README 的源头；改动它后重新
  sync 即生效。
- 提交照常在 internal 上做；sync 脚本自愈（自动切 internal、reset --hard、
  切换分支前把 public README 读入内存——分支切换后该文件会从磁盘消失）。

## 前端 / Mock 验证

| 脚本 | 用途 | 运行方式 |
| --- | --- | --- |
| `dev-mock-screenshot.js` | 对 `npm run dev` 的 mock 页面批量截图（环境/备份/设置/新建/引导），输出到 `.screenshots/` | `NODE_PATH=./node_modules node scripts/dev-mock-screenshot.js`（需先启动 dev server） |
| `dev-window-capture.ps1` | 对真实桌面窗口截图 + 可选点击/输入，用于桌面端端到端验证 | `powershell -ExecutionPolicy Bypass -File scripts/dev-window-capture.ps1 -OutName x.png [-ClickDx n -ClickDy n -TypeText "文本"]` |

## 发布 / 安装器

| 脚本 | 用途 | 运行方式 |
| --- | --- | --- |
| `release-collect.cjs` | 收集 tauri build 产物到 `release/v<版本>/`（安装版+便携版），生成含 SHA256 的 `RELEASE.md` | `npm run dist`（构建+收集）或 `node scripts/release-collect.cjs`（仅收集） |

### 发布纪律（重要）

- `npm run dist` **只构建并收集产物**，不安装、不复制到任何安装目录。
  `release/v<版本>/` 是唯一输出位置；安装由人工执行 `setup.exe`。
- 升版本时同步改三处：`package.json`、`src-tauri/Cargo.toml`、
  `src-tauri/tauri.conf.json`（`Cargo.lock` 随构建自动更新），
  再执行 `npm run dist`。**不要复用旧版本号**，否则会覆盖既有发布包。
- 安装前先结束运行中的 BrowserHub（release exe 被占用会报
  `拒绝访问 (os error 5)`）；结束 BrowserHub 不影响任何 Chrome 环境。

### 若 NSIS 打包报 `os error 32`

`npm run dist` 在 `Running makensis` 之后报
`另一个程序正在使用此文件 (os error 32)`，通常是杀毒软件正在扫描刚生成的
安装包导致的瞬时文件锁。可稍后重试；或手动兜底：

```powershell
cd src-tauri\target\release\nsis\x64
& "$env:LOCALAPPDATA\tauri\NSIS\makensis.exe" installer.nsi
Copy-Item nsis-output.exe ..\..\bundle\nsis\BrowserHub_<版本>_x64-setup.exe -Force
cd <repo>
node scripts/release-collect.cjs
```

## 已知局限：UI 点击自动化不可靠

`dev-window-capture.ps1` 的点击功能受三个因素干扰（详见
[debug-log-tray-verification.md](../docs/debug-log-tray-verification.md)）：
宿主 IDE 窗口覆盖、窗口状态漂移（最大化记住）、无边框窗口隐形边框导致
坐标偏移。**后端行为验证请优先用日志实证法**（TEMP-DEBUG 模式，见该文档），
点击自动化仅用于"确认页面能打开"级别的粗验证。

跨进程窗口/线程级取证（窗口探针、RIP 参数、WER 报告反查）见
[debug-log-webview2-zombie-freeze.md](../docs/debug-log-webview2-zombie-freeze.md)。
