# 用户数据目录形态：env_default 与 env_* 环境

日期：2026-11-15 · 状态：已实现并实测（commit 910d291）
关联：ADR-0001（程序/数据分离）· [app-data-vs-webview.md](app-data-vs-webview.md)

## 核心模型：一个引擎，多份用户信息

```
chrome.exe = 一个引擎（可任意多实例并行）
   ├── 实例 A ← 加载 env_default     （系统默认 Chrome）
   ├── 实例 B ← 加载 env_8362…       （环境：Tianxiaomai）
   └── 实例 C ← 加载 env_659b…       （环境：Glaucus）
```

Chrome 是多实例引擎：只要 user-data-dir 不同，任意多实例天然并行、互不干扰。
"启动环境"不是独占行为——默认 Chrome 和任意环境可以同时运行。

## 两种形态（正交并存，互不切换）

| 形态 | 目录 | 打开方式 | 用途 |
| --- | --- | --- | --- |
| **系统默认 Chrome** | `env_default` | 双击桌面图标 / 任务栏 / 其他程序打开链接 / BrowserHub 列表"启动" | 日常浏览的"那个 Chrome"，承载原 account0 数据 |
| **BrowserHub 环境** | `env_<id>` | 仅 BrowserHub 环境列表"启动"（`--user-data-dir` 直连） | 多账号隔离，任意多开 |

**关键设计决定：env_default 不参与"默认环境切换"。**
用户双击图标想要的从来是"打开我那个普通 Chrome"，而不是"切换到某个环境"；
想用某个环境就直接从 BrowserHub 启动，速度一样快。切换是伪需求，
曾经实现的双层链路（User Data → current → env）已拆除（见下文"演进"）。

## 接管机制（固定 junction）

```
%LOCALAPPDATA%\Google\Chrome\User Data   ← junction，接管时创建一次，永不改动
    └──> D:\BrowserProfiles\env_default  ← 真实数据（原 account0 的 0.93GB 完整副本）
```

- 托管：若 User Data 是真实目录（Chrome 原生数据），先改名备份为
  `User Data.account0.bak`（可还原），再建 junction。
- 同步（可选）：托管前可把现有 User Data 内容**复制**进 env_default
  （保留原目录不动；有 Local State 冲突保护，避免覆盖已有数据）。
- 还原：删 junction + 备份目录改名回原位；无备份时创建全新空目录。
- 删除保护：env_default 不是环境记录，不存在"删除环境"误伤路径。

## 实现落点

| 项 | 位置 |
| --- | --- |
| 固定目录定义 | `system_default.rs::default_profile_dir()` → `DEFAULT_ENVIRONMENT_ROOT\env_default` |
| junction 创建/校验 | `system_default.rs::take_over()`（备份→删旧→mklink /J→校验 reparse point） |
| junction 目标解析 | `DeviceIoControl` + `FSCTL_GET_REPARSE_POINT` + `FILE_FLAG_OPEN_REPARSE_POINT`；PathBuffer 起始于字节 16（对照 fsutil 逐字节核实，无需管理员） |
| 默认实例检测 | 命令行**无** `--user-data-dir` 的 chrome.exe 即默认实例；所有托管/同步/还原操作前强制校验未运行 |
| 状态查询 | `get_system_default_row`：托管状态 + 实时运行状态 + 目录大小一站式 |
| 无参启动 | `launch_system_default_chrome`：不带参数启动 chrome.exe，与双击图标完全等价；已运行时拒绝 |
| 设置 UI | `SystemDefaultCard`：托管/同步/还原按钮 + 备份路径展示 + 运行中警告 |
| 列表 UI | `SystemDefaultRow`：环境列表固定首行（🏠 图标 + "默认"徽标 + accent 高亮），状态/空间实时，菜单无编辑/删除/备份 |

## 实测证据

- junction 生效：不带参数启动 Chrome → 17 进程 → 105 个文件实时写入 env_default。
- 双击图标 ≡ 列表"启动"：同一 junction、同一目标、同一效果。
- account0 原目录全程未动（0.93GB 完好）。

## 演进记录（为何拆掉双层链路）

曾实现 `User Data → current → env` 双层切换链（current 原子 rename 切换），
后判定为伪需求拆除。保留的教训：

1. "切换默认环境"混淆了两个概念——用户要的是"打开普通 Chrome"，
   不是"把普通 Chrome 变成某个环境"。
2. 双层的真实收益（切换无空窗）只在"确实需要切换"时才有价值。
3. env_default 与 env_* 是**平级的两种形态**，不是"默认值与候选列表"的关系。

`is_default_profile` DB 字段（migration v2）已弃用保留（避免再次迁移），
代码中不再读取。
