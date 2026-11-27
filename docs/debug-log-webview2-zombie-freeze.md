# 调试实录：WebView2 僵尸进程导致应用"点不开"（2026-11-27）

> 状态：**根因已定位；修复已实现并通过实测（2026-11-27），待发布**。
> 本文保留完整的取证过程与证据，供后续加固设计参考。
> 相关代码：`src-tauri/src/window.rs`（`show_main_window` / `request_close`）、
> `src-tauri/src/services/platform.rs`（`focus_existing_window`）、`src-tauri/src/lib.rs`（启动流程）。

## 摘要

BrowserHub 主线程永久阻塞在 `ShowWindow(hwnd, SW_SHOW)` 里；原因是主窗口的
**跨进程 WebView2 子窗口所属的 `msedgewebview2.exe` 已被整个挂起**（52/52 线程
`Suspended`）。该进程在 **2026-11-22 15:50:08 因 OOM 崩溃**（异常码 `0xE0000008`，
Chromium 的 OOM 终止码），WER 抓完 dump 后**冻结了进程却没有终止它**，留下一个
"活着的僵尸"。此后任何一次"显示窗口"都会在 `ShowWindow` 上永远等待。

应用没有死循环、没有数据库锁、Chrome 环境完全正常。

## 现象

- 托盘图标在，tooltip 正常（`BrowserHub - Chrome 环境管理器 / 左键: 显示窗口 / 右键: 打开/退出`）
- 左键无反应，窗口不出现；右键菜单也不出
- `browserhub.exe` 进程存活（pid 35660，启动于 2026-11-15 09:32:56），CPU 不再增长
- 应用日志最后一条为 **2026-11-20 07:48:22**（启动 `env_659b46cc6bc9`），之后 7 天无任何记录
- 环境 Chrome（pid 32364）仍在正常运行

## 证据链

| # | 事实 | 实测值 |
| --- | --- | --- |
| 1 | 主线程停在哪个系统调用 | tid 29788，`RIP = win32u.dll+0x1B24`；该地址是 `NtUserShowWindow` 存根 `syscall` 后的 `ret`，即**阻塞在内核调用中** |
| 2 | 调用的参数 | `r10 (arg1) = 0x1211198`（主窗口 HWND），`rdx (arg2) = 5`（**SW_SHOW**） |
| 3 | 是否死循环 | 进程 CPU 4 秒增量 **0.00s**；两次采样 RIP 完全相同 |
| 4 | 窗口是否真的显示 | 主窗口 style `0x04CF0000`，**不含 `WS_VISIBLE (0x10000000)`** → `ShowWindow` 没有走完 |
| 5 | 卡在等谁 | 主窗口的两个子窗口 `Chrome_WidgetWin_1`(0x10E13DC) / `Chrome_RenderWidgetHostHWND`(0x1511624) 属于 `msedgewebview2.exe`(pid 32148)，`WM_NULL` 探测 **2000–2013ms 超时** |
| 6 | 对照组 | BrowserHub 自己的窗口 `WM_NULL` 9ms、`WM_GETTEXT` 5ms 正常应答（返回 "BrowserHub"）；自己的子窗口 0–3ms |
| 7 | WebView2 进程状态 | pid 32148 **52/52 线程** `WaitReason=Suspended`；`SuspendThread` 返回 **prevCount=1**（排查前就已被挂起）；无调试器附加 |
| 8 | 崩溃证据 | 事件日志 `2026-11-22 15:50:08`：`msedgewebview2.exe 157.0.4341.46` 崩溃，**异常码 `0xE0000008`**（Chromium OOM 终止码），模块 `KERNELBASE.dll+0x25369` |
| 9 | 崩溃实例归属 | WER 报告 `AppCrash_msedgewebview2.e_8b24…` 的 `AppSessionGuid=000014c0-0001-016e-e8b6-cd3da174dd01`，末 8 字节按小端解 FILETIME = **2026-11-15 09:32:56**，正是 pid 32148 的启动时间 |
| 10 | 同类故障面 | `2026-11-25 09:06:27` zcode-switch 的 WebView2（`157.0.4341.60`）与 Chrome 的 GPU 进程（`157.0.8103.78`）同样以 `0xE0000008` 崩溃；至今分别 **49/49、52/52** 线程 Suspended |
| 11 | 内存背景 | 物理内存 15.9GB，提交 27.2GB / 上限 32.8GB，可用 3.6GB —— 长期高内存压力 |

### 窗口探针明细

| 窗口 | 所属进程 | 线程 | 结果 |
| --- | --- | --- | --- |
| 主窗口 `Tauri Window` 0x1211198 | browserhub 35660 | 29788 | `WM_GETTEXT` 5ms ✓ |
| `tray_icon_app` 0x551610 | browserhub 35660 | 29788 | 8ms ✓ |
| `TAURI_DRAG_RESIZE_BORDERS` 0x8160A | browserhub 35660 | 29788 | 0ms ✓ |
| `WRY_WEBVIEW` 0xA812B4 | browserhub 35660 | 29788 | 0ms ✓ |
| `Chrome_WidgetWin_0` 0x1D17DC | browserhub 35660 | 29788 | 3ms ✓ |
| `Chrome_WidgetWin_1` 0x10E13DC | **msedgewebview2 32148** | 19640 | **2013ms 超时** ✗ |
| `Chrome_RenderWidgetHostHWND` 0x1511624 | **msedgewebview2 32148** | 19640 | **2000ms 超时** ✗ |
| `Intermediate D3D Window` 0xB90BDE | msedgewebview2 24420 | 19296 | 2008ms 超时（GPU 进程，非关键） |

## 故障机制

```
用户点托盘 / 单实例激活
        │
        ▼
window::show_main_window()                 [UI 线程 tid 29788]
   window.unminimize() / window.show()
        │
        ▼
tao → ShowWindow(hwnd, SW_SHOW)            ← 同步调用，无超时
        │
        ▼
win32k：显示窗口 → 逐个通知子窗口（跨进程同步消息）
        │
        ├─ TAURI_DRAG_RESIZE_BORDERS / WRY_WEBVIEW / Chrome_WidgetWin_0  ✓ 本进程
        └─ Chrome_WidgetWin_1 / Chrome_RenderWidgetHostHWND
                │
                └─ 属于 msedgewebview2 32148（52/52 线程 Suspended）
                        └─ 永不处理 WM_SHOWWINDOW
                                └─ ShowWindow 永不返回 → 窗口永不出现
```

主线程被卡死后，所有依赖它的路径一起失效：

- 托盘点击、托盘菜单（事件在同一线程的事件循环里）永远不处理
- `request_close` / 托盘"退出"也不会执行
- 进程仍持有单实例互斥锁 `Local\BrowserHub.Desktop.SingleInstance`
- 再次双击 exe 会走 `focus_existing_window()` → 对**同一个僵尸窗口**再调
  `ShowWindow` → 新进程也会卡死（本次未实测，避免再产生一个卡死进程）

## 时间线

| 时间 | 事件 | 依据 |
| --- | --- | --- |
| 2026-11-15 09:32:56 | BrowserHub 启动，WebView2 随之启动（pid 32148） | 进程 StartTime + 日志 |
| 2026-11-20 07:48:22 | 最后一次正常活动：启动 `env_659b46cc6bc9` | 日志 |
| 2026-11-22 15:32:34 | 32148 仍在创建新线程（当时还活着） | 线程 StartTime |
| **2026-11-22 15:50:08** | **32148 以 `0xE0000008` 崩溃**，WER 冻结未终止 | 事件日志 + WER 报告 |
| 之后某次 | 托盘"显示窗口"→ `ShowWindow` 永久阻塞，窗口再未出现 | 主线程 RIP 实证 |
| 2026-11-27 08:32 | 排查确认上述状态 | 本次诊断 |

## 排除的假设

| 假设 | 排除依据 |
| --- | --- |
| UI 线程死循环 | CPU 增量 0.00s |
| 整个进程死锁 | 主窗口 `WM_GETTEXT` 5ms 正常返回 |
| `Get-Process.Responding=False` 代表死机 | **假信号**：MainWindowHandle 指向 `Tao Thread Event Target`（0x7A1590），不是主窗口 |
| Chrome/环境把应用拖死 | 环境 Chrome 32364 及全部渲染/工具进程正常 |
| 数据库/备份/文件锁 | 卡点在内核窗口调用，CPU 为 0，日志无相关任务 |
| 托盘代码 bug | 托盘窗口存在、tooltip 正常；问题是主线程不处理事件 |
| 被调试器冻结 | `ProcessDebugPort=0`，`CheckRemoteDebuggerPresent=False` |

## 关键取证方法（可复用）

1. **不要只信 `Get-Process.Responding`**。Tauri 进程的 `MainWindowHandle` 可能指向
   `Tao Thread Event Target` 辅助窗口，从而误报"未响应"。
2. **逐窗口探测**：`EnumWindows` + `EnumChildWindows`，对每个窗口
   `SendMessageTimeout(WM_NULL)`；必要时用 `WM_GETTEXT`（需要窗口过程参与）复核。
   超时 = 该窗口所属线程不处理消息。
3. **判断线程是否早已被挂起**：`SuspendThread` 的返回值是"之前的挂起计数"。
   `prevCount=1` 说明进程在排查前就处于挂起状态，不是本次操作造成的。
4. **定位阻塞的系统调用**：`SuspendThread` + `GetThreadContext` 取 RIP/RSP 和
   `rcx/rdx/r8/r9/r10`。线程阻塞在 syscall 时，RIP 指向 `syscall` 之后的 `ret`。
   再用 `GetProcAddress(win32u.dll, name)` **校准**导出地址——
   手写解析 PE 导出表容易把名字对错（本次第一版就错把 `NtUserShowWindow`
   解析成了 `NtUserSlicerControl`）。
5. **识别崩溃实例**：WER `.wer` 文件的 `AppSessionGuid` 末 8 字节按小端解成
   FILETIME，就是该进程实例的启动时间；与目标进程 `StartTime` 比对即可确认。
6. **识别 OOM**：`0xE0000008` 是 Chromium 的 OOM 终止异常码（`RaiseException`），
   WER 会把它显示为 KERNELBASE 中的 APPCRASH。

## 教训

- **跨进程子窗口 + 同步 `ShowWindow` = 无超时阻塞**。WebView2 的窗口是宿主窗口的
  子窗口，一旦其线程冻结，父窗口的显示流程不可恢复。
- **单实例互斥 + 僵尸窗口 = 重启也救不回来**：新实例会主动对僵尸窗口
  `ShowWindow`，把自己也搭进去。
- **WebView2 崩溃不会自动传导到 UI**：本次没有任何 `ProcessFailed` 提示，
  日志也没有记录，用户只会看到"点了没反应"。
- **WER 冻结 ≠ 终止**：崩溃进程可能以全线程 Suspended 的形式继续存在，占用
  句柄、窗口和互斥量。
- **高内存压力是背景条件**：16GB 物理内存 / 27GB 提交，11-22–11-25 三个
  Chromium 系进程先后 OOM，说明这不是单次偶发。

## 修复实现（2026-11-27，已验证，待发布）

| 问题 | 实现 |
| --- | --- |
| 显示/隐藏窗口会卡死 | `window::ensure_webview_responsive`：所有会同步通知子窗口的操作（show / hide / minimize / maximize / close）先做健康检查 |
| 已崩溃的 WebView2 判定 | `webview_health::is_webview_suspended`：探测 `Chrome_WidgetWin_1` 所属线程的挂起计数；非 0 = 确定的僵尸（BrowserHub 自己从不挂起 WebView2） |
| 僵尸自动恢复 | 检测到 Suspended → **不弹窗，直接自动重启**（`relaunch_now`），用户看到的是窗口正常打开 |
| 无法确定的无响应 | `webview_health::is_webview_responsive`：1.2s 消息探测；超时但未 Suspended 才弹“重启 / 退出 / 取消” |
| 单实例激活不再阻塞 | 改为命名事件 + 后台监听线程 → `run_on_main_thread` 走统一的受保护 show 路径；不再从第二个进程调用 `ShowWindow` |
| 崩溃进程残留 | `process::terminate_webview_processes`：启动时（已持有单实例互斥锁）清理仍指向本产品 WebView2 UDF 的孤儿 `msedgewebview2.exe`，避免新 WebView2 被目录锁卡死 |
| UI 线程死锁逃生 | `window::spawn_watchdog`：后台线程只用原始 Win32；UI 无响应且 WebView2 已死约 30s（WebView2 仍活则 90s）时弹出“重启 / 退出 / 取消” |
| 托盘无法关闭 | 托盘新增“重新启动 BrowserHub”；“退出”改为 `std::process::exit`，不经过窗口销毁 |

### 本轮实测（真实桌面端）

| 场景 | 结果 |
| --- | --- |
| 正常启动 / 显示 | ✅ 窗口可见，WebView2 子窗口正常 |
| `WM_CLOSE`（closeBehavior=minimize） | ✅ 隐藏到托盘，进程存活 |
| 第二实例激活已隐藏窗口 | ✅ 命名事件恢复窗口，只有一个进程 |
| WebView2 被挂起后启动第二实例 | ✅ **无弹窗自动重启**，旧进程结束，新窗口可见 |
| 启动前清理孤儿 WebView2 | ✅ 日志 `cleaned up 2 orphaned WebView2 process(es)` |
| 看门狗：渲染进程死亡 | ✅ 约 12s 弹窗；“退出”可用 |
| Chrome 环境 | ✅ 全程未受影响 |

### 仍待办

- wry 0.57 未暴露 `ProcessFailed`，目前依靠线程状态/消息探测；升级 wry 后可改为事件驱动。
- 未实现“原地重建 WebView2”，恢复方式为进程级重启（对用户是无感的，Chrome 不受影响）。
- 版本号与发布包：已随 **0.1.1** 打包到 `release/v0.1.1/`（未自动安装）。

## 临时恢复（旧版本，不改代码）

结束 `browserhub.exe` 后重新启动即可（**不会影响任何 Chrome 环境**，这是产品设计
约束）。僵尸 `msedgewebview2.exe` 会随父进程退出被系统回收；若未回收，再结束对应
pid。**不要结束 Chrome 进程。**
