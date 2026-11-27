# BrowserHub

Chrome 浏览器环境管理器（Windows 桌面应用）。一个环境 = 一个独立的 Chrome User Data Directory，登录状态、扩展、浏览数据互不影响。

- 技术栈：Tauri 2 + React/TypeScript + Tailwind 4 / Rust + SQLite
- 本地优先：不上传任何数据，SQLite 只存元数据，绝不读 Cookies/密码
- 文档索引：

| 文档 | 内容 |
| --- | --- |
| [docs/changelog.md](docs/changelog.md) | 版本变更日志（0.1.0 + Unreleased/已知问题） |
| [docs/timeline.md](docs/timeline.md) | 项目时间线：阶段、架构修正原因、首次线上级故障 |
| [docs/architecture.md](docs/architecture.md) | 目录结构、前后端边界、IPC 约定 |
| [docs/data-and-safety.md](docs/data-and-safety.md) | 数据存放位置、进程检测、破坏性操作守则 |
| [docs/user-data-forms.md](docs/user-data-forms.md) | env_default（系统默认）与 env_*（环境）两种形态、接管机制 |
| [docs/debug-log-tray-verification.md](docs/debug-log-tray-verification.md) | 调试实录：托盘隐藏验证的 5 个坑与日志实证法 |
| [docs/debug-log-webview2-zombie-freeze.md](docs/debug-log-webview2-zombie-freeze.md) | 调试实录：WebView2 僵尸进程导致"点不开"的完整取证与加固待办 |
| [docs/development.md](docs/development.md) | 构建/运行/打包命令与离线依赖说明 |
| [docs/bundle-size.md](docs/bundle-size.md) | 产物体积实测、归因与回归警戒线 |
| [docs/app-data-vs-webview.md](docs/app-data-vs-webview.md) | 应用数据与 WebView 缓存的概念区分、业界规范、当前布局依据 |
| [docs/multi-product-webview-udf-policy.md](docs/multi-product-webview-udf-policy.md) | forga.space 多产品 UDF 独立策略、否决共享的理由、新接入产品清单 |
| [docs/verification.md](docs/verification.md) | 已验证的验收矩阵与遗留事项 |
| [docs/decisions/](docs/decisions/) | 关键决策记录（ADR）：[0001](docs/decisions/0001-installer-separate-program-and-data.md) 安装器程序/数据分离 · [0002](docs/decisions/0002-forga-space-data-layout.md) forga.space 数据布局与 WebView2 收纳 |
| [scripts/README.md](scripts/README.md) | 开发/验证脚本清单 |

> 产品需求原文见 `vibe coding.md`。
