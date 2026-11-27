# BrowserHub

> 一个环境 = 一个独立的 Chrome 用户数据目录。登录状态、扩展、浏览数据互不影响。

BrowserHub 是一款 Windows 桌面应用，用于创建、管理和一键启动多套相互独立的
Chrome 浏览器环境——多 Google 账号、工作/生活分离、客户账号隔离，不再需要
手动执行脚本或输入启动参数。

## 功能

- **环境管理**：新建（自动生成独立数据目录）或导入已有目录（引用不复制），
  重命名、颜色标识、空间统计
- **一键启动**：以独立的 `--user-data-dir` 启动 Chrome 实例；多个环境可
  同时运行，与日常浏览器互不影响
- **运行状态识别**：通过进程命令行精确匹配（而非可执行文件名），准确显示
  每个环境的 运行中 / 已停止 状态；状态不明时拒绝危险操作
- **系统默认 Chrome 托管**（可选）：将桌面 Chrome 图标指向独立管理的
  `env_default` 目录，与各环境并行共存；原数据自动备份、一键还原
- **备份与恢复**：完整目录副本，恢复前强制确认；备份目录可自定义
- **崩溃自愈**：WebView2 渲染进程崩溃或被系统挂起时自动重启恢复，
  窗口不会永久卡死；Chrome 环境不受影响
- **桌面体验**：系统托盘、可配置关闭行为（隐藏到托盘 / 退出）、开机自启、
  单实例保护；关闭 BrowserHub 不影响已启动的 Chrome

## 下载

从 [GitHub Releases](https://github.com/Glauy/browser-hub/releases) 下载：

| 文件 | 说明 |
| --- | --- |
| `BrowserHub_<版本>_x64-setup.exe` | 安装版（当前用户，免管理员，含卸载器） |
| `BrowserHub_<版本>_x64-portable.exe` | 便携单文件，双击即用 |

平台支持：**Windows 10/11 x64**（WebView2 由系统提供）。
macOS / Linux 暂不支持（后端使用 Win32 API）。

## 数据安全承诺

- **本地优先**：无账号体系、无上传、无遥测。所有数据只存放在本机
- **元数据隔离**：SQLite 仅保存环境名称、路径等管理信息；
  **绝不读取** Cookies、密码或任何浏览内容
- **程序与数据分离**：程序默认装在 `%LOCALAPPDATA%\Programs\BrowserHub`
  （安装时可选目录），数据在 `%LOCALAPPDATA%\forga.space\BrowserHub`，
  卸载默认保留数据
- **破坏性操作多重防护**：运行中/状态不明拒绝删除；符号链接拒判；
  系统目录保护；完整路径 + 二次确认

## 技术栈

Tauri 2（Rust）+ React 19 + TypeScript + Tailwind CSS 4 + SQLite。
安装包约 1.9 MiB，运行内存占用低。

## 构建

```powershell
npm install
npm run dist    # 前端构建 + cargo release + 收集产物到 release/v<版本>/
```

## 许可

暂未设置开源许可（私有项目）。联系作者获取使用授权。
