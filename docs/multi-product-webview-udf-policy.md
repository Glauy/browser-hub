# 多产品 WebView2 UDF 策略（forga.space）

日期：2026-11-15 · 状态：决策已定，随产品家族扩张生效
关联：[app-data-vs-webview.md](app-data-vs-webview.md) · [ADR-0002](decisions/0002-forga-space-data-layout.md)

## 问题

forga.space 计划发布多款 Tauri 桌面应用，每个应用都带一个 WebView2 用户数据文件夹（UDF，
含引擎组件与缓存，首装 ~70MB，随使用增长）。是否可以让全团队产品**共享一个 UDF**，
省磁盘省内存？

## 事实基础（微软官方文档）

- Process Model 文档明确允许共享："A user data folder can be shared by multiple applications,
  but be sure to consider the implications on performance and management."
- 共享收益：多个应用共用一个浏览器进程组（省内存）；组件缓存（WidevineCdm、crx cache 等
  ~35MB）只存一份（省磁盘）。
- UDF 内含 cookies、localStorage、IndexedDB、密码自动保存——**网页侧状态全部存这里**。
- 各应用 `CoreWebView2Environment` 参数（语言、附加参数等）不一致时，共享 UDF 的环境
  创建会**直接失败**。
- Tauri/Wry 架构要求独立 UDF：自定义协议（`tauri://`）与 IPC 桥无法在共享宿主下工作。

## 决定

**不共享。每个产品独立 UDF，位于各自产品根内：**

```
%LOCALAPPDATA%\forga.space\<Product>\webview\EBWebView\   ← 每产品一份
```

（BrowserHub 即 `%LOCALAPPDATA%\forga.space\BrowserHub\webview\`，由 ADR-0002 确定。）

## 理由（共享方案的四个否决点）

1. **数据串味**：清某产品的缓存会摧毁其他产品的网页登录态和 UI 状态；UDF 是"网页侧
   状态容器"，不是纯缓存。
2. **进程耦合**：共享 UDF = 共用浏览器进程组，一个应用崩溃/升级拖垮所有正在运行的产品。
3. **卸载冲突**：卸载某产品不能删共享 UDF，"卸载干净"承诺破产，违反每产品根唯一原则。
4. **配置冲突**：产品间环境参数不一致直接创建失败，等于把所有产品锁死在同一套
   WebView2 参数上。

## 膨胀的正确应对（代替共享）

| 手段 | 说明 | 成本 |
| --- | --- | --- |
| 删缓存类子目录 | `component_crx_cache`、`GrShaderCache`、`ShaderCache`（约 27MB） | 首启重新下载组件 |
| 整删 `webview\` | 核弹级，代价 = 重新下载 ~20MB 组件 | 同上 |
| 产品内"清除 Web 缓存"按钮 | 删 cache 类子目录、保留 `Default`（站点数据） | 待实现，各产品可选 |
| 备份排除 `webview\` | 无备份价值 | 零 |

**各产品实现清单**（新 Tauri 产品接入 forga.space 时照抄）：
1. 数据根 `%LOCALAPPDATA%\forga.space\<Product>\`，WebView2 UDF 指向其下 `webview\`
   （参考 BrowserHub：窗口 `create:false` + `WebviewWindowBuilder::data_directory`）。
2. 卸载钩子：勾选"删除应用数据"时删本产品 `webview\` 与数据根，**不动其他产品目录**。
3. 可选：设置页提供"清除 Web 缓存"。

## 参考

- WebView2 UDF 管理：https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder
- WebView2 进程模型（共享语义）：https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model
