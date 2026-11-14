# 应用数据 vs WebView 缓存：概念与规范

日期：2026-11-15 · 参考：ADR-0001 / ADR-0002 · 状态：BrowserHub 当前布局的依据说明

> 多产品共享 UDF 的可行性分析与团队决策，独立成文见
> [multi-product-webview-udf-policy.md](multi-product-webview-udf-policy.md)。

## 一、两回事，生命周期完全不同

| | 应用数据 | WebView 缓存（EBWebView） |
| --- | --- | --- |
| 内容 | manager.db（元数据）、config.json（设置）、logs、window-state.json | GPU 着色器缓存、字体缓存、HTTP 缓存、Service Worker、localStorage、Crashpad 转储 |
| 丢失后果 | 环境列表、设置全部丢失（不可重建） | 无感知，引擎下次启动自动重建（可随时删） |
| 增长特性 | 随使用缓慢增长（KB~MB 级） | 峰值很大（本项目实测 ~70MB），大小不可控 |
| 谁写 | 我们的 Rust 代码（受控 schema） | Chromium 引擎内部（不受控，随时写） |
| 备份价值 | 高——建议纳入备份 | 零——纯缓存 |
| 安全语义 | 含结构化元数据 | 含网页侧可写存储（localStorage 等），渲染进程可写 |

结论：**是两回事**。关键差异是"丢失后果"和"谁在写"——数据丢不起且写入受控；缓存随时可弃且由引擎自由写入。

## 二、业界规范：分开，但可以同根

### 微软官方建议（WebView2 文档）
用户数据文件夹（UDF）与应用安装目录分开；**应用自身的重要数据不要放进 UDF**——
因为 UDF 内容随时可能被引擎清理/重置，且卸载应用时常被整体删除。

### 桌面软件惯例（三种常见形态）

```
形态 A：并列（Chrome、VS Code）
  %LOCALAPPDATA%\Google\Chrome\       ← 数据
  %LOCALAPPDATA%\Google\Chrome\UDF    ← 引擎数据（Chrome 自己就是引擎，融合）
  实际 Chrome 是融合的：User Data 里既有 Profile 数据也有引擎缓存，靠子目录分区。

形态 B：同级子目录（Electron 默认、多数混合应用）
  %APPDATA%\<App>\            ← 应用数据（config/db）
  %APPDATA%\<App>\Cache|GPUCache|...  ← 引擎数据混在同目录不同子目录
  Electron 的 app.getPath('userData') 同时承载两者，混放，靠命名区分。

形态 C：显式分离（嵌入式/网壳类应用，如微信、钉钉的部分版本）
  %APPDATA%\<App>\            ← 纯应用数据
  %APPDATA%\<App>\webview\ 或独立目录 ← 引擎数据独立子目录
```

**没有"必须物理分盘/分根"的规范**，共识只有两条：
1. 应用数据绝不能放在"可能被引擎清空/被卸载器连删"的位置；
2. 引擎数据要能一键删除而不伤及数据。

### 我们的选择：形态 C（同根不同子目录）

```
%LOCALAPPDATA%\forga.space\BrowserHub\
  ├── manager.db / config.json / window-state.json   ← 应用数据（根下，受控）
  ├── logs\  temp\                                    ← 应用产生的可清理内容
  └── webview\EBWebView\                              ← WebView2 引擎数据（独立子目录，整目录可弃）
```

同根的理由：产品根唯一（forga.space 家族管理要求，见 ADR-0002）；
分离的理由：webview 子目录可整体删除重建、卸载清缓存不清数据、备份只需排除 webview。

## 三、BrowserHub 当前的指定情况（两处都是显式指定）

| 项 | 谁决定 | 代码位置 |
| --- | --- | --- |
| 应用数据目录 | **显式指定**（Rust） | `app_paths.rs` → `LOCALAPPDATA\forga.space\BrowserHub` |
| WebView 缓存目录 | **显式指定**（Rust 建窗时传入） | `lib.rs` → `WebviewWindowBuilder::from_config(...).data_directory(paths.webview_data_dir)` |
| identifier | `space.forga.browserhub` | 身份标识，因上述两处均已显式指定，不再派生任何目录 |

即：**两个目录都脱离了 Tauri 默认（identifier 拼接）**，全部收进产品根，由我们全权控制。

## 四、EBWebView 的真实构成（实测拆解，v0.1.0）

"webview 目录 ~70MB"不是一团笼统的缓存，实测构成差异很大：

| 子目录 | 体积 | 性质 | 可否删 |
| --- | --- | --- | --- |
| WidevineCdm | 21.9 MB | DRM 版权组件（引擎按需下载） | 删后播放 DRM 内容会重新下载 |
| component_crx_cache | 21.4 MB | 引擎组件安装包缓存 | ✅ 可删，会重下 |
| Subresource Filter | 12.3 MB | 广告过滤规则 | 随引擎版本 |
| GrShaderCache + ShaderCache | 5.1 MB | 纯渲染缓存 | ✅ 可删 |
| Default | 2.8 MB | **站点数据**（localStorage/IndexedDB） | ⚠️ 删了丢 UI 内网页登录态 |
| 其余（拼写/语音/PKI 等） | ~7 MB | 引擎随附数据 | 不必动 |

要点：**纯缓存只占约 27MB**；组件/规则类 ~34MB 删了会重新下载 20MB+（省得有限）；
Default 是站点数据不能乱删。"删了重建"只对一半内容成立。

## 五、多产品 UDF 策略（摘要）

团队多个 Tauri 应用能否共享一个 UDF？**决定：不共享，每产品独立**。
完整分析（微软官方共享语义、四个否决点、膨胀应对手段、新接入产品接入清单）
独立成文：[multi-product-webview-udf-policy.md](multi-product-webview-udf-policy.md)。

摘要理由：UDF 含 cookies/localStorage（共享会串数据）；共享 UDF 共用浏览器进程组
（一崩全崩）；卸载无法干净分离；环境参数不一致时共享直接失败。且 Tauri 架构本身
（自定义协议 + IPC 桥）要求独立 UDF。

实测构成拆解（见上表）说明共享收益有限：纯缓存仅 ~27MB，组件类删除后会重新下载
~20MB，实际节省不及管理复杂度的代价。

## 六、备份策略影响（实践意义）

`webview\` 可从任何备份中排除（省 ~70MB 且无价值）；应用数据根下的其余文件是备份的主体。
未来若实现"应用数据备份"功能，白名单即：`manager.db`、`config.json`、`window-state.json`（logs/temp 可选）。
