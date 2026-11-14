# 调试实录：托盘隐藏功能验证（2026-11-15）

一次"简单"功能（关闭窗口隐藏到托盘）的验证耗时远超预期。复盘根本原因与教训，
避免下次重蹈覆辙。功能本身最终以**日志实证法**验证通过（commit a2a5271）。

## 时间线与踩坑

### 坑 1：点击自动化被三个因素连环干扰

UI 自动化点击标题栏"最小化"按钮始终无法触发 IPC，排查耗掉最多时间。三个叠加原因：

1. **Orca 主窗口覆盖**：BrowserHub 移到 (100,100) 后，宿主 IDE Orca 是顶层窗口，
   `WindowFromPoint(625,601)` 返回的 pid 是 Orca 而非 BrowserHub——点击物理上
   落在了别的进程。解法：`SetWindowPos(HWND_TOPMOST)` + 先 `SetForegroundWindow`。
2. **窗口状态漂移**：验证中途点了最大化按钮 → window-state.json 记住了
   `maximized=true` → 后续重启全部以最大化 (-8,-8, 1936x1056) 恢复 → 之前按
   1216x768 布局算的按钮坐标全部失效。
3. **无边框窗口的隐形边框**：`GetWindowRect` 含 ~8px 不可见 resize 边框，
   webview 客户区从 +8 开始；frameless + DPI 96 时外框坐标 ≠ CSS 坐标。

**教训**：坐标类自动化点击前必须先 `GetWindowRect` 拿到**当下**的 rect（而非假设），
并确认窗口状态（最大化/最小化/被覆盖）。可用 `WindowFromPoint` 验证"这个点
物理上属于谁"——本次就是靠它发现 Orca 覆盖的。

### 坑 2：崩溃的脚本回滚了未提交的修复

sync-main 脚本调试时，每次失败运行末尾的 `git checkout` / `reset --hard`
把**只存在于工作区的脚本修改**一并回滚——写了三遍的新版脚本被连续吞掉两次。

**教训**：调试期间修改的脚本**先 commit 再运行**。`reset --hard` 只安全于
已提交内容。

### 坑 3：PowerShell 5.1 的 UTF-16 BOM 写坏 JSON

用 `Set-Content -Encoding UTF8` 改写 config.json（改 closeBehavior），
PS 5.1 写入 UTF-16 LE BOM，Rust serde 解析失败 → 启动时触发"损坏隔离"逻辑，
config 被改名 quarantine，设置回退默认值。

**教训**：凡是要写 UTF-8 无 BOM 文本文件（json/rs/js），用
`[System.IO.File]::WriteAllText` + `UTF8Encoding($false)`，不用 `Set-Content`。
（本项目已三次踩此坑：.ps1 脚本、config.json、release-collect.cjs。）

### 坑 4：cargo 没有重新编译

改了 lib.rs 后 `cargo build` 报 BUILD OK 但 exe 时间戳没变——当时在**仓库根目录**
跑了 `npm run dist` 链路里的构建，工作目录不对导致构建了旧状态；且后续
`Copy-Item` 把旧 exe 覆盖到安装目录，验证自然失败。

**教训**：验证代码行为前，核对 `(Get-Item exe).LastWriteTime` **大于** 源码
`.LastWriteTime`。构建产物时间戳是最诚实的证据。

### 坑 5：IsWindowVisible 的误导

外部 `IsWindowVisible(hwnd)` 对隐藏后的 Tauri 窗口返回 True（可能与 webview
子窗口或 WS_VISIBLE 标志的遗留有关），而 Tauri 自己的 `window.is_visible()`
返回 False。外部探针一度让验证结论反复。

**教训**：跨进程窗口状态判断，优先用**应用自身日志**（权威），外部 Win32 探针
只做辅助。

## 最终验证方法：日志实证法（推荐套路）

UI 点击自动化不可靠时，绕过 UI 直接验证后端路径：

```rust
// lib.rs initialize() 末尾临时加入
std::thread::spawn(move || {
    std::thread::sleep(Duration::from_secs(6));
    log::info!("TEMP-DEBUG: firing minimize()");
    window::minimize(&handle);
    let visible = window::main_window(&handle)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    log::info!("TEMP-DEBUG: visible after minimize = {visible}");
});
```

日志输出 `firing minimize()` → `visible after minimize = false` 即为实证。
验证完成后**立即删除**临时代码并重新构建。

## 有效的验证顺序（下次直接照抄）

1. 改代码 → `cargo build --release` → **核对 exe 时间戳**
2. 复制 exe 到安装位置（先杀运行中的进程）
3. 启动应用 → 等待 ≥10s → 读日志（`%LOCALAPPDATA%\forga.space\BrowserHub\logs\`）
4. 断言写进日志（TEMP-DEBUG 模式），而不是依赖外部探针
5. 完成后删临时代码，重新构建 + 安装
