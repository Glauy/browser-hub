# BrowserHub — Chrome Browser Environment Manager
## 完整产品定义与工程开发规范

你现在需要开发一个完整的 Windows 桌面应用：

**BrowserHub — Chrome 浏览器环境管理器**

你需要同时承担高级产品经理、桌面应用架构师、UI/UX 设计师、Windows 原生开发工程师和 QA 工程师的职责。

不要将它理解成一个普通的 CRUD 管理后台，也不要仅仅实现一个带有启动按钮的网页。

这是一个面向多 Google 账号、多浏览器登录环境用户的本地桌面效率工具。核心目标是让用户能够方便地创建、导入、管理和启动多套独立的 Chrome 浏览器环境。

在开始开发之前，先理解产品目标、技术边界和真实使用场景，再进行架构设计与工程实施。

---

# 一、产品定位

## 1.1 产品是什么

BrowserHub 是一个 Chrome Browser Environment Manager。

用户可以创建多套相互独立的 Chrome 浏览器环境，每套环境拥有独立的浏览器用户数据目录。

例如：

- Google 工作账号
- Google 个人账号
- Google 测试账号
- 第三方网站账号 A
- 第三方网站账号 B
- 临时测试环境

每套环境都可以保存自己的：

- Google 登录状态
- 第三方网站登录状态
- Cookies
- Local Storage
- IndexedDB
- 浏览历史
- 扩展程序
- 浏览器设置
- 其他 Chrome 用户数据

用户通过 BrowserHub 选择环境，一键启动对应的 Chrome 实例，不需要再手动执行脚本或输入启动参数。

## 1.2 产品不是什么

第一版不开发：

- 自研浏览器内核
- Chromium 打包与分发
- Google 账号登录管理系统
- Cookie 查看和编辑器
- 密码管理器
- 网站级账号容器
- 标签页级身份隔离
- 浏览器自动化平台
- Playwright / Puppeteer 工作流
- 远程浏览器服务
- 云端账号同步
- 多用户协作系统

BrowserHub 只负责管理本机 Chrome 的独立用户数据环境。

不要为了扩展性而过度设计，不要将简单问题复杂化。

---

# 二、核心技术原理

必须正确理解 Chrome 的用户数据目录机制。

Chrome 支持通过启动参数指定独立的 User Data Directory：

```powershell
chrome.exe --user-data-dir="D:\BrowserProfiles\env_8f31a2" --new-window
```

每个独立目录都是一套完整的 Chrome 用户数据环境。

例如：

```text
D:\BrowserProfiles\
├── env_8f31a2\
│   ├── Local State
│   ├── Default\
│   │   ├── Cookies
│   │   ├── Local Storage\
│   │   ├── IndexedDB\
│   │   ├── Extensions\
│   │   └── ...
│   └── ...
│
├── env_7d29b5\
│   ├── Local State
│   ├── Default\
│   └── ...
│
└── env_c51e83\
    ├── Local State
    ├── Default\
    └── ...
```

每个环境完全独立。

必须区分：

- User Data Directory：整个浏览器用户数据根目录。
- Profile Directory：User Data Directory 内部的具体 Profile，例如 Default、Profile 1。

本产品第一版采用：

**一个 BrowserHub 环境对应一个独立的 Chrome User Data Directory。**

不在同一 User Data Directory 下通过 Default、Profile 1 等方式管理多个业务环境。

这能够最大程度减少环境之间的数据混淆。

注意：不能将一个 Chrome User Data Directory 当成普通文件夹，随意拆分、拼装其中的 Cookies、Local Storage 或 IndexedDB。

必须将其作为一个整体管理。

---

# 三、桌面应用技术架构

## 3.1 技术选型

优先采用：

| 层级     | 技术               | 职责               |
| -------- | ------------------ | ------------------ |
| 桌面容器 | Tauri 2            | Windows 桌面应用   |
| 前端     | React + TypeScript | 界面和交互         |
| 构建工具 | Vite               | 前端开发和构建     |
| 样式     | Tailwind CSS       | UI 样式            |
| 组件     | 项目现有组件体系   | 通用 UI            |
| 后端     | Rust               | Windows 原生能力   |
| 数据库   | SQLite             | 环境元数据         |
| 安装包   | Tauri Bundler      | Windows 安装和分发 |

如果当前目录已经存在项目，先检查现有技术栈、目录结构、组件体系和开发规范。

不要无视已有项目重新初始化。

如果没有项目，则按照上述技术栈初始化。

## 3.2 架构边界

采用清晰的前后端职责分离。

前端负责：

- 页面布局
- 用户交互
- 环境列表展示
- 状态展示
- 表单校验
- 交互反馈

Rust 后端负责：

- 文件系统操作
- 目录选择
- Chrome 路径检测
- Chrome 进程启动
- 进程状态识别
- 环境目录创建
- 导入与删除
- 备份与恢复
- 空间统计
- SQLite 数据访问

所有系统操作统一通过 Tauri IPC Commands 完成。

前端不得直接操作本地文件系统，不得通过浏览器 API 模拟 Windows 系统操作。

建议采用分层架构：

```text
src/
├── app/
├── components/
├── features/
│   ├── environments/
│   ├── browsers/
│   ├── backups/
│   └── settings/
├── hooks/
├── lib/
├── types/
└── styles/

src-tauri/
├── src/
│   ├── main.rs
│   ├── commands/
│   ├── domain/
│   ├── services/
│   │   ├── chrome/
│   │   ├── environment/
│   │   ├── process/
│   │   ├── filesystem/
│   │   └── backup/
│   ├── repositories/
│   ├── database/
│   └── errors/
├── capabilities/
└── tauri.conf.json
```

可以根据实际规模合理调整，但必须保持职责清晰。

---

# 四、目录与存储设计

这是产品的重要设计，必须严格遵守。

## 4.1 两种完全独立的数据目录

必须区分：

1. BrowserHub 自身的应用数据目录。
2. Chrome 浏览器环境根目录。

两者不能混淆。

### A. 应用数据目录

固定使用 Windows 标准应用数据位置：

```text
%LOCALAPPDATA%\BrowserHub\
├── manager.db
├── config.json
├── logs\
└── temp\
```

用于保存：

- SQLite 数据库
- BrowserHub 配置
- 日志
- 临时文件

不保存 Chrome 的 Cookie、密码或浏览器凭证。

### B. 浏览器环境根目录

默认位置：

```text
D:\BrowserProfiles\
```

这是产品默认推荐位置，不是强制位置。

用户可以修改为：

```text
E:\BrowserProfiles
D:\ChromeData
F:\MyBrowser\Profiles
C:\Users\Public\BrowserProfiles
```

不得硬编码盘符或固定目录。

首次启动时：

- 默认推荐 `D:\BrowserProfiles`。
- 检查 D 盘是否存在。
- 检查目标目录是否可创建、可写入。
- 如果 D 盘不可用，提示用户选择其他目录，并提供合理的替代推荐位置。
- 不要未经用户确认自动将数据放到其他盘符。

必须提供目录选择按钮，调用 Windows 原生目录选择对话框。

用户可以随时修改环境根目录。

## 4.2 环境目录结构

建议：

```text
D:\BrowserProfiles\
├── env_8f31a2\
│   ├── Local State
│   ├── Default\
│   └── ...
│
├── env_7d29b5\
│   ├── Local State
│   ├── Default\
│   └── ...
│
└── backups\
```

环境目录使用稳定且唯一的 ID。

例如：

```text
env_8f31a2
```

不要直接使用用户填写的环境名称作为物理目录名。

原因：

- 用户可以随时重命名环境。
- 不需要移动真实数据目录。
- 避免中文、特殊字符和重名问题。
- 路径更加稳定。

`backups` 可以作为默认备份目录，但备份位置也应允许用户配置。

## 4.3 环境路径必须独立保存

Environment 实体必须保存完整绝对路径：

```typescript
interface Environment {
  id: string;
  name: string;
  userDataDir: string;
}
```

特别注意：

**不能只保存环境 ID，再根据当前环境根目录动态拼接所有环境路径。**

原因是导入的环境可能位于完全不同的磁盘和目录。

例如：

```text
环境 A：D:\BrowserProfiles\env_8f31a2
环境 B：E:\OldChrome\GoogleAccount
环境 C：F:\Testing\ChromeData
```

即使用户修改默认环境根目录，之前导入的环境仍然必须可以正常使用。

修改根目录只影响未来创建的新环境，不自动移动已有环境。

## 4.4 根目录修改规则

用户修改浏览器环境根目录时：

- 只更新新建环境的默认存储位置。
- 不移动已有环境。
- 不删除已有环境。
- 不自动复制已有环境。
- 不改变已有环境保存的绝对路径。
- 对根目录不可用或权限不足的情况给出明确提示。

如果未来需要迁移，作为独立的用户主动操作实现。

---

# 五、数据模型

使用 SQLite 保存 BrowserHub 元数据。

## 5.1 Environment

```typescript
interface Environment {
  id: string;
  name: string;
  description?: string;

  userDataDir: string;

  sourceType: 'managed' | 'imported';

  browserConfigId: string;

  color?: string;
  icon?: string;

  createdAt: string;
  updatedAt: string;
  lastLaunchedAt?: string;

  lastStatus: 'unknown' | 'running' | 'stopped' | 'error';
}
```

说明：

- managed：BrowserHub 创建的环境。
- imported：用户导入的已有环境。
- userDataDir：实际 Chrome 数据目录的绝对路径。

## 5.2 BrowserConfig

```typescript
interface BrowserConfig {
  id: string;
  name: string;

  executablePath: string;
  version?: string;

  isDefault: boolean;

  createdAt: string;
  updatedAt: string;
}
```

支持：

- 自动检测 Chrome。
- 用户手动指定 Chrome.exe。
- 修改 Chrome 安装路径。
- 记录 Chrome 版本。
- 支持多个 Chrome 安装配置，但不将不同 Chrome 可执行文件误认为不同环境。

## 5.3 AppSettings

```typescript
interface AppSettings {
  environmentRootDir: string;
  backupRootDir?: string;

  closeBehavior: 'exit' | 'minimize';

  launchOnStartup: boolean;
  minimizeToTray: boolean;
}
```

可以根据实际需要扩展，但不要提前增加没有使用场景的字段。

---

# 六、核心功能

## 6.1 Chrome 检测

首次启动时自动检测本机 Chrome。

优先检查常见安装位置：

- 当前用户安装目录
- Program Files
- Program Files (x86)
- Windows 注册表中的安装信息

支持用户手动指定 Chrome.exe。

必须验证可执行文件存在且可以访问。

检测失败时提供清晰的引导，不要直接崩溃。

## 6.2 创建浏览器环境

用户点击创建环境：

1. 输入环境名称。
2. 可选填写描述。
3. 选择环境颜色或图标。
4. 确认存储位置。
5. 创建独立目录。
6. 将绝对路径保存到 SQLite。
7. 环境出现在列表中。

目录默认创建在当前环境根目录下：

```text
D:\BrowserProfiles\env_xxxxxx
```

创建后启动 Chrome。

Chrome 首次启动会自动生成自己的 User Data Directory 结构。

不要提前伪造 Local State、Cookies 等 Chrome 内部文件。

## 6.3 导入已有浏览器环境

这是非常重要的功能。

用户可以将已有 Chrome User Data Directory 导入 BrowserHub。

例如用户之前使用：

```powershell
chrome.exe --user-data-dir="D:\chrome-accounts\account2"
```

现在可以直接将：

```text
D:\chrome-accounts\account2
```

导入为一个环境。

导入流程：

1. 选择已有目录。
2. 校验目录是否存在。
3. 检查目录是否可访问。
4. 尝试识别 Chrome User Data Directory 特征。
5. 检查是否已经被 BrowserHub 管理。
6. 输入新的显示名称。
7. 保存其绝对路径。
8. 完成导入。

默认采用引用原目录的方式，不复制数据。

必须明确区分：

- 引用原目录：只登记路径，不移动数据。
- 复制为新环境：复制完整数据目录，作为单独的可选操作。

不能在导入时默认复制几个 GB 的浏览器数据。

不能将 Chrome 内部的 Default 目录错误地当成完整 User Data Directory。

如果用户选择的是 Profile 子目录而不是 User Data Directory，需要提示其选择正确的上级目录。

导入失败时解释原因，不要静默忽略。

## 6.4 启动浏览器环境

用户在列表中点击启动。

后端执行：

```powershell
chrome.exe --user-data-dir="D:\BrowserProfiles\env_8f31a2" --new-window
```

正式实现时：

- 使用 Rust 原生进程启动能力。
- 使用参数数组，不要拼接命令字符串。
- 正确处理带空格和中文的路径。
- 不依赖 PowerShell 或批处理脚本。
- 不需要启动一个额外的浏览器服务。
- 不需要将 Chrome 嵌入 BrowserHub 窗口。

启动后更新环境状态和最近启动时间。

启动失败时返回明确错误。

## 6.5 多环境并行运行

必须支持：

```text
BrowserHub
  ├── Google 工作账号 Chrome
  ├── Google 个人账号 Chrome
  └── 测试环境 Chrome
```

不同 User Data Directory 可以同时运行。

但是同一个 User Data Directory 同一时间只能被一个 Chrome 实例使用。

必须防止重复启动同一个环境。

不要简单地通过 `chrome.exe` 进程名称判断环境是否运行，因为所有 Chrome 实例都使用相同的进程名称。

需要结合：

- 进程 PID。
- 进程启动记录。
- 进程命令行参数。
- User Data Directory。
- Windows 进程查询能力。

识别实际运行环境。

考虑 Chrome 多进程架构，不能把一个子进程 PID 当作整个浏览器实例的唯一标识。

对于无法可靠识别的进程状态，应标记为 unknown，而不是错误地显示 stopped。

必要时使用 Windows 原生进程信息接口识别命令行。

不得强制结束 Chrome 进程来释放环境。

## 6.6 环境管理

支持：

- 新建环境。
- 编辑名称。
- 修改描述。
- 修改颜色。
- 修改图标。
- 导入环境。
- 移除环境。
- 删除环境及其数据。
- 搜索环境。
- 按名称排序。
- 按最近使用排序。
- 查看实际数据目录。
- 复制环境路径。
- 打开环境所在目录。

删除必须区分两个操作：

**从 BrowserHub 移除**

只删除数据库中的管理记录，不删除真实浏览器数据。

**删除环境及其数据**

删除数据库记录并永久删除对应的真实目录。

必须显示明确的二次确认，展示将删除的实际路径。

正在运行的环境禁止删除。

如果无法确认环境是否已经退出，应拒绝执行破坏性操作。

## 6.7 环境空间统计

显示每个环境的数据目录大小。

例如：

| 环境     | 占用空间 |
| -------- | -------: |
| 工作账号 |   1.2 GB |
| 个人账号 |   860 MB |
| 测试环境 |   420 MB |

采用后台异步扫描，避免阻塞 UI。

允许手动刷新统计。

不要频繁扫描整个目录。

## 6.8 缓存清理

作为辅助功能。

不能为了减少空间而随意删除 Chrome 数据。

优先只考虑 Chrome 关闭后清理明确可再生的缓存目录。

必须：

- 使用明确的白名单。
- 不删除 Cookies。
- 不删除 Local Storage。
- 不删除 IndexedDB。
- 不删除登录状态相关数据。
- 不整体删除 Service Worker 数据。
- 不在 Chrome 运行时清理。
- 清理前显示预计释放空间。
- 提供用户确认。

无法确定安全性的文件一律保留。

第一版可以先不开放此功能，只保留架构扩展位置。

## 6.9 备份与恢复

备份是辅助功能，但需要考虑数据一致性。

备份前必须确认 Chrome 已经完全退出。

不能直接在 Chrome 正在写入数据库时复制整个 User Data Directory。

备份内容包括完整环境目录。

支持：

- 选择备份位置。
- 手动创建备份。
- 展示备份时间。
- 展示备份大小。
- 恢复备份。
- 删除备份。

恢复前必须检查目标环境是否正在运行。

恢复操作需要确认覆盖范围。

不得默认覆盖其他环境。

第一版不需要云端备份。

---

# 七、桌面 UI/UX 设计

## 7.1 设计定位

BrowserHub 是桌面效率工具，不是传统后台管理系统。

设计方向：

- 专业。
- 克制。
- 清晰。
- 高效率。
- 信息密度合理。
- 操作路径短。
- 具有成熟 Windows 桌面软件的质感。

不要做成常见的 SaaS Dashboard。

避免：

- 大面积渐变。
- 过多装饰卡片。
- 无意义阴影。
- 过大的统计数字。
- 过度圆角。
- 花哨动画。
- 重复说明文字。
- 为了视觉效果堆叠图标。

优先使用列表、表格、紧凑工具栏、清晰的操作菜单和适度留白。

如果项目已有 UI 规范，必须遵循现有规范。

## 7.2 主界面

建议采用：

```text
┌──────────────────────────────────────────────────────────┐
│ BrowserHub                                  设置   ─ □ × │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  浏览器环境                         + 新建环境  导入环境  │
│                                                          │
│  搜索环境...                                              │
│                                                          │
│  名称               状态       浏览器       最近启动      │
│  ------------------------------------------------------  │
│  Google 工作账号    ● 运行中   Chrome       12:30         │
│  Google 个人账号    ○ 已停止   Chrome       昨天          │
│  测试环境           ○ 已停止   Chrome       11-12         │
│                                                          │
│                                                          │
│  3 个环境   1 个运行中                     数据目录设置   │
└──────────────────────────────────────────────────────────┘
```

这是结构参考，不要求像素级照搬。

## 7.3 环境列表

每行展示：

- 环境名称。
- 运行状态。
- 浏览器。
- 最近启动时间。
- 可选空间占用。
- 更多操作。

主要操作：

- 启动。
- 编辑。
- 打开目录。
- 复制路径。
- 移除。
- 删除。

运行中的环境展示清晰状态。

启动按钮应根据状态变化：

- 已停止：启动。
- 正在启动：显示加载状态。
- 运行中：显示运行中状态，允许打开现有窗口或聚焦窗口（仅在能够可靠实现时提供）。
- 状态未知：显示未知状态，不允许进行危险操作。

## 7.4 环境创建与导入

使用轻量弹窗或侧边面板。

不要为简单操作设计复杂多步骤向导。

创建时仅收集必要信息。

导入时重点展示真实路径，让用户知道 BrowserHub 将引用哪个目录。

## 7.5 设置页面

设置分为：

**浏览器设置**

- Chrome 可执行文件路径。
- 当前 Chrome 版本。
- 重新检测 Chrome。

**存储设置**

- 浏览器环境根目录。
- 当前环境数量。
- 可用空间。
- 修改根目录。
- 打开目录。

**应用设置**

- 关闭窗口行为。
- 最小化到系统托盘。
- 开机启动（可选）。

**备份设置**

- 默认备份目录。
- 备份管理。

设置页面保持简单，不要将所有信息塞进一个页面。

---

# 八、Windows 桌面行为

## 8.1 窗口管理

支持：

- 正常窗口。
- 最小化。
- 最大化。
- 关闭。
- 记忆上次窗口大小。
- 记忆窗口位置。
- 单实例机制。

关闭窗口时可以选择：

- 直接退出 BrowserHub。
- 最小化到系统托盘。

注意：

**关闭 BrowserHub 不得关闭已经启动的 Chrome 实例。**

BrowserHub 退出后，Chrome 必须继续正常运行。

## 8.2 系统托盘

可以支持：

- 打开 BrowserHub。
- 快速启动最近使用的环境。
- 退出 BrowserHub。

托盘退出只退出管理器，不结束 Chrome。

如果实现托盘功能会明显拖延 MVP，可以放在后续阶段。

## 8.3 安装与卸载

提供 Windows 安装包。

支持：

- 安装。
- 升级。
- 卸载。
- 首次启动初始化。
- 配置持久化。

卸载 BrowserHub 时：

- 不得默认删除浏览器环境目录。
- 不得删除用户的 Chrome 数据。
- 必须明确提示用户数据保留情况。

---

# 九、Tauri Commands 接口

建议先定义后端命令，再开发前端交互。

至少提供以下命令：

```text
detect_chrome
get_browser_configs
update_browser_config

get_app_settings
update_app_settings
select_directory

create_environment
import_environment
list_environments
update_environment
remove_environment
delete_environment

launch_environment
get_environment_status
refresh_environment_status

get_environment_stats

backup_environment
list_backups
restore_environment
delete_backup
```

所有命令采用结构化返回值。

示例：

```typescript
interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

错误码应该稳定且具有业务含义，例如：

```text
CHROME_NOT_FOUND
CHROME_PATH_INVALID
ENVIRONMENT_NOT_FOUND
ENVIRONMENT_ALREADY_RUNNING
ENVIRONMENT_DIRECTORY_NOT_FOUND
ENVIRONMENT_DIRECTORY_INVALID
ENVIRONMENT_DIRECTORY_IN_USE
PERMISSION_DENIED
BACKUP_FAILED
RESTORE_FAILED
```

不要把底层系统错误原样显示给用户。

应该转换为容易理解的错误信息，同时在本地日志中保留必要的诊断信息。

---

# 十、安全与数据保护

浏览器环境包含真实的登录凭证，必须将其作为敏感本地数据保护。

必须遵守：

1. 不读取 Cookie 内容。
2. 不读取保存的密码。
3. 不解析登录凭证。
4. 不上传浏览器数据。
5. 不将浏览器数据写入 SQLite。
6. 不将用户数据写入普通日志。
7. 不在前端展示敏感文件内容。
8. 不在没有用户确认的情况下删除真实目录。
9. 不在 Chrome 运行时备份或恢复。
10. 不在 Chrome 运行时清理数据目录。

应用本身尽可能使用最小权限。

Tauri 的文件系统和系统命令权限采用最小授权原则，不要开放不必要的能力。

---

# 十一、开发实施顺序

不要一开始就同时开发所有功能。

必须按以下阶段实施，每个阶段完成后验证，再继续。

## Phase 1：桌面应用基础

目标：建立真正可运行的 Windows 桌面应用。

实现：

- Tauri 2 初始化。
- React + TypeScript。
- Rust 后端。
- SQLite 初始化。
- 主窗口。
- 基础布局。
- 应用配置读取和保存。
- 首次启动目录配置。
- Windows 原生目录选择。

验收：

- 能正常启动桌面程序。
- 能选择浏览器环境根目录。
- 默认推荐 `D:\BrowserProfiles`。
- 关闭重新打开后配置仍然存在。

## Phase 2：Chrome 环境管理核心

实现：

- Chrome 自动检测。
- Chrome 路径手动指定。
- 创建环境。
- 导入已有环境。
- 保存环境绝对路径。
- 环境列表。
- 编辑环境。
- 移除环境。
- 删除环境。

验收：

- 能创建独立 User Data Directory。
- 能导入之前通过命令行创建的环境。
- 不复制导入目录。
- 不会因修改根目录导致已有环境路径失效。

## Phase 3：Chrome 启动与进程状态

实现：

- 指定 User Data Directory 启动 Chrome。
- 多环境并行运行。
- 同一环境重复启动保护。
- 进程状态识别。
- 最近启动时间更新。
- 启动失败处理。
- 运行状态刷新。

验收：

1. 启动环境 A，确认 Chrome 使用 A 的用户数据。
2. 启动环境 B，确认可以同时运行。
3. A 和 B 登录不同账号，互不影响。
4. 关闭 A 后再次启动，登录状态仍然保留。
5. 重复启动 A 不会错误地打开另一个空白环境。
6. 关闭 BrowserHub 不影响已经运行的 Chrome。

## Phase 4：桌面体验与数据管理

实现：

- 环境搜索。
- 空间统计。
- 打开环境目录。
- 复制环境路径。
- 设置页面。
- 系统托盘。
- 备份与恢复。

清理缓存可以暂缓。

验收：

- 界面状态准确。
- 备份恢复数据完整。
- 不会误删除正在运行的环境。
- 不会在 Chrome 运行时执行危险文件操作。

## Phase 5：正式构建与交付

实现：

- Windows 安装包。
- 安装和卸载测试。
- 首次启动测试。
- 升级测试。
- 权限异常测试。
- 中文路径测试。
- 空格路径测试。
- 多盘符测试。

最终提供：

- 完整源码。
- 项目运行说明。
- Windows 安装包。
- 必要的构建说明。

---

# 十二、质量与验收标准

不能只以页面是否能展示作为完成标准。

必须重点验证真实 Chrome 行为。

测试场景：

| 测试项             | 预期结果               |
| ------------------ | ---------------------- |
| 创建环境           | 自动生成独立数据目录   |
| 导入旧环境         | 可以直接引用原目录     |
| 修改显示名称       | 不改变物理路径         |
| 修改默认根目录     | 不影响已有环境         |
| 多环境同时启动     | 相互独立               |
| 同环境重复启动     | 正确识别并阻止重复启动 |
| 关闭 BrowserHub    | Chrome 继续运行        |
| 关闭 Chrome 再启动 | 恢复登录状态           |
| 删除环境           | 有明确的数据保护确认   |
| 中文路径           | 正常工作               |
| 路径包含空格       | 正常工作               |
| D 盘不可用         | 提供替代路径选择       |
| Chrome 不存在      | 给出明确错误           |
| 目录权限不足       | 给出明确错误           |

所有与浏览器登录状态相关的测试，使用测试账号和测试环境。

---

# 十三、产品设计原则

整个开发过程必须遵循以下原则：

**1. 先解决真实问题，不要过度设计。**

产品核心只有一个：快速切换独立浏览器环境。

**2. 优先使用 Chrome 原生机制。**

不自己实现浏览器隔离，不重新发明 User Data Directory。

**3. 环境元数据与浏览器数据分离。**

SQLite 只管理环境信息，Chrome 自己管理浏览器数据。

**4. 导入优先引用，不默认复制。**

用户已经有大量历史环境，不能要求重新迁移。

**5. 允许自由选择存储位置。**

默认 `D:\BrowserProfiles`，但绝不限制用户使用其他磁盘和目录。

**6. 桌面应用必须具备真正的系统能力。**

不能只做 Web 页面套壳。目录选择、进程启动、状态识别、数据操作都必须使用合适的 Windows 原生能力。

**7. 保持产品简洁。**

不要擅自增加账号同步、Cookie 管理、自动化、远程服务等功能。

---

# 十四、开始开发前的工作要求

不要直接开始写代码。

首先完成以下工作：

1. 检查当前项目是否已有工程和技术规范。
2. 梳理产品功能与用户真实操作流程。
3. 确认 Tauri、React、Rust 的职责边界。
4. 确认 Chrome User Data Directory 的处理机制。
5. 设计数据库模型。
6. 设计 Rust 服务和 Tauri Commands。
7. 设计主界面与设置页面的信息架构。
8. 输出简明的实施计划和关键技术风险。

然后开始实施。

如果发现技术方案存在问题，先解释问题并提出合理替代方案，不要擅自偏离产品定位。

开发过程中必须保持：

- 真实可运行。
- 功能完整。
- 类型安全。
- 错误处理完善。
- UI 一致。
- 数据安全。
- 可维护。

最终目标：

**用户不再需要编写或执行任何 Chrome 启动脚本，只需要打开 BrowserHub，选择浏览器环境，点击启动，即可进入对应的完整浏览器登录环境。**