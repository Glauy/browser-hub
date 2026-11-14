# 验证记录

日期：2026-11-14 首版 · 2026-11-15 增补（安装器/托管/系统默认行）。环境：Windows 10.0.19045，Chrome 157.0.8103.78。

## 已验证（真实桌面端，release exe）

| 项 | 结果 | 依据 |
| --- | --- | --- |
| 编译 | ✅ `cargo check/build --offline` 通过（debug + release） | EXIT=0 |
| 首次启动 | ✅ 创建 DB/WAL、日志目录、迁移 v1→v2 | 日志 + 文件存在 |
| 引导流程 | ✅ 检测到 Chrome 157.0.8103.78；根目录/备份目录创建；`setupCompleted` 持久化 | config.json + 截图 |
| Chrome 检测 | ✅ 常见路径 + 注册表（发现本机 Chromium 136，App Paths） | 设置页截图 |
| 新建环境 | ✅ 生成 `env_701b319a0509` 目录并登记 DB | 截图 + 日志 |
| 启动环境 | ✅ Chrome 以 `--user-data-dir=… --new-window` 启动（PID 34852）；数据目录生成 Local State/Default | Win32_Process 命令行 |
| 关闭 BrowserHub 不影响 Chrome | ✅ 应用退出后 chrome 主进程仍存活 | 进程对比 12→8（子进程自然退出），主进程在 |
| 重启后状态检测 | ✅ 命令行扫描识别为"运行中"；占用 63.1 MB | 截图 |
| 状态回落 | ✅ Chrome 结束后刷新显示"已停止" | 截图 |
| 备份 | ✅ 487 文件 / 66.4MB 完整副本（含 Local State、Default\Preferences） | 磁盘校验 |
| 恢复 | ✅ 覆盖确认 + 恢复成功，无临时残留 | 日志 + 目录 |
| 设置页 | ✅ 浏览器/存储/应用分区，磁盘空间 126GB 读取正确 | 截图 |
| 窗口状态 | ✅ window-state.json 持久化 | 文件内容 |
| 安装器（ADR-0001） | ✅ 静默安装、快捷方式、卸载器、安装版运行；程序/数据分离 | 实测 |
| 数据迁移 | ✅ 旧 `%LOCALAPPDATA%\BrowserHub` → `forga.space\BrowserHub`（0.93GB 环境数据无感迁移） | 日志 + 目录 |
| 数据库迁移 v2 | ✅ `is_default_profile` 字段添加（日志 "database migrated to version 2"） | 日志 |
| 系统默认托管 | ✅ junction `User Data → env_default`；无参启动 Chrome 17 进程 / 105 文件实时写入 env_default | fsutil + 进程 + 文件时间戳 |
| 系统默认行 UI | ✅ 列表首行：🏠 图标、"默认"徽标、accent 高亮、955MB 空间、状态 | 截图 |
| 设置托管卡片 | ✅ "已托管"徽标、链路指向 env_default、备份路径、还原按钮 | 截图 |
| account0 数据保全 | ✅ 原 account0（0.93GB / 6378 文件）完整复制到 env_default，原目录未动 | robocopy + 计数校验 |

## Mock 前端（浏览器，早期验证）

✅ 环境/备份/设置/新建/引导页渲染与交互（Playwright 截图，存于 `.screenshots/`，脚本见 `scripts/README.md`）。

## 未完成 / 已知限制

- 未覆盖：多环境并发检测、`unknown` 状态实际触发路径、自启开关注册表实测、
  托管/还原按钮的 UI 自动化点击验证（后端逻辑已手动等价验证；UI 层因桌面自动化
  焦点问题未走通，需人工点一次确认）。
- 已弃用：`is_default_profile` DB 字段保留但不再读取；双层 current 链接方案已拆除
  （演进过程见 user-data-forms.md）。
- 发布 exe 尺寸 ~4.9MB（LTO+strip），安装包 1.9MiB。
