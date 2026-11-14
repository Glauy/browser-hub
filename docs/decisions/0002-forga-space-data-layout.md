# ADR-0002：forga.space 产品家族数据布局与 WebView2 收纳

日期：2026-11-15 · 状态：已实施并实测

## 背景

用户将以 `forga.space` 为产品家族域名发布多款产品。原布局散落三个顶层目录：

```
%LOCALAPPDATA%\BrowserHub\              应用数据（v1 布局，且早期版本曾混入 exe）
%LOCALAPPDATA%\com.browserhub.desktop\  WebView2 缓存（Tauri 由 identifier 自动派生，~91MB）
%LOCALAPPDATA%\Programs\BrowserHub\     程序（ADR-0001 分离后）
```

要求：**每个产品在 %LOCALAPPDATA% 下只有一个根目录**，即 `%LOCALAPPDATA%\forga.space\<Product>\`，
WebView2 数据也必须收纳其中，不允许 identifier 平铺目录存在。

## 决定

1. **应用数据**：`%LOCALAPPDATA%\forga.space\BrowserHub\`（`AppPaths::resolve()` 改为
   `LOCALAPPDATA\forga.space\BrowserHub`）。旧目录存在且有 manager.db/config.json 时整体
   rename 迁移（跨卷时降级为复制后删除）；新目录已存在则跳过。
2. **WebView2 数据**：`forga.space\BrowserHub\webview\`。因 Tauri 默认强制
   `%LOCALAPPDATA%\<identifier>`，采取：
   - `tauri.conf.json` 窗口加 `"create": false`（配置仅作模板，阻止 Tauri 自动建窗口）；
   - `lib.rs` 在 setup 中用 `WebviewWindowBuilder::from_config(...).data_directory(绝对路径)` 显式建窗。

   踩坑记录：若不设 `create:false`，Tauri 先按默认目录建好窗口，代码再建同名窗口报
   `a webview with label 'main' already exists`，且实际运行的仍是默认目录（webview 子目录为空）。
3. **程序目录**：维持 ADR-0001（`%LOCALAPPDATA%\Programs\BrowserHub`）。
4. **卸载**：勾选"删除应用数据"时清 `forga.space\BrowserHub`、空根 `forga.space`，
   并兜底清理 legacy 目录（`com.browserhub.desktop`、`BrowserHub`）。
5. **identifier 改为 `space.forga.browserhub`**（反域名惯例，与产品家族域名同源）。
   运行时用途盘点（Tauri 2.12.5 源码核实）：identifier 只在路径解析（`app_*_dir` 系列，
   已被我们显式指定绕开）和 `dataDirectory` 相对路径拼接中使用；本项目无 deep link、
   无插件、无文件关联，改标识无副作用。WebView2 缓存目录随之变为
   `%LOCALAPPDATA%\space.forga.browserhub`——但已由 `data_directory` 覆盖为
   `forga.space\BrowserHub\webview`，实际不产生磁盘目录。

## 后果

- 最终布局（实测）：

  ```
  %LOCALAPPDATA%\forga.space\BrowserHub\
    ├── manager.db / config.json / window-state.json
    ├── logs\  temp\
    └── webview\EBWebView\          ← WebView2 引擎缓存，按应用独立（Tauri/Wry 不共享）
  ```
- identifier 为 `space.forga.browserhub`（ADR-0002 决定 5），因 data_directory 显式覆盖，
  不再派生 `%LOCALAPPDATA%\<identifier>` 目录。

- WebView2 缓存为什么存在且较大（~91MB 量级）：GPU/字体/渲染缓存。Tauri 应用**不与其他应用共享**
  WebView2 环境（需要自定义协议与 IPC 桥），共享模式（`%LOCALAPPDATA%\Microsoft\Edge WebView2`）
  仅适用于非定制宿主，Tauri 不支持。数据收进产品根后，仅视觉归一，体积不变。
- 多产品共存：后续产品放 `forga.space\<Other>\`，互不影响；卸载某产品只删自己的子目录与空根。
- ⚠️ 迁移只搬数据目录，不搬 webview 缓存（可重建）；旧 `com.browserhub.desktop` 需卸载勾选或手动删除。

## 备选方案（未采用）

- 改 identifier 为正序 `forga.space.browserhub`：目录名可对齐，但 identifier 语义被扭曲
  （WebView2/插件等按该值隔离），且仍无法把缓存放进 `forga.space\BrowserHub\` 内部。
- ~~保留 `com.browserhub.desktop`~~：初版曾保留，后按用户要求改为 `space.forga.browserhub`
  （见决定 5）——保留旧值虽无磁盘副作用，但标识符与产品家族无关联，不规范。
- 窗口配置 `dataDirectory` 相对路径：Tauri 会拼成 `localData\<label>\<相对路径>`，
  多一层窗口 label，且与 label 耦合，弃用。
