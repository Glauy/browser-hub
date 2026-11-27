# 开发

## 环境要求

- Node ≥ 20、Rust 1.77+（MSVC）、Windows 10/11
- 本项目依赖为**离线固定版本**（网络受限环境搭建）：npm 依赖来自本地复制，crate 使用 `cargo --offline`，版本锁定见 `package.json` / `src-tauri/Cargo.toml`

## 常用命令

```powershell
# 前端
npm run dev                 # Vite 开发服务器 http://localhost:1420（含 mock 后端）
npm run build               # tsc 类型检查 + vite 构建 → dist/

# 桌面（调试）
npm run desktop:dev         # 等价 cargo run --manifest-path src-tauri/Cargo.toml
# 或：先启动 npm run dev，再运行 src-tauri/target/debug/browserhub.exe（devUrl 已嵌入 debug 构建）

# 桌面（发布，前端资源嵌入 exe）
npm run desktop:build       # 前端构建 + cargo build --release

# 后端单独检查
cd src-tauri; cargo check --offline
```

## Mock 后端

浏览器直接打开 `http://localhost:1420` 时使用内存 mock（`src/lib/mock.ts`），
便于无 Tauri 环境下开发 UI；命令名/参数改动必须同步 mock 与 Rust。

## 验证脚本

见 [scripts/README.md](../scripts/README.md)：mock 截图、桌面窗口捕获（点击/输入/截图）。

## 打包安装器（NSIS）
- ✅ **已完成并实测**。`npm run dist`（= `tauri build` + 产物收集）一次性产出：
  - `release/v<版本>/BrowserHub_<版本>_x64-setup.exe` — 安装包（约 1.9 MiB，currentUser 模式，含卸载器）
  - `release/v<版本>/BrowserHub_<版本>_x64-portable.exe` — 便携单文件（即 release exe 改名）
  - `release/v<版本>/RELEASE.md` — 大小 + SHA256 清单与安装说明
  版本目录互不覆盖，发新版直接把 `release/v*` 目录发出去即可。
- **程序与数据分离**（详见 [decisions/0001](decisions/0001-installer-separate-program-and-data.md)）：
  程序默认装 `%LOCALAPPDATA%\Programs\BrowserHub`（交互安装可选目录，自动追加 `\BrowserHub`），
  数据固定在 `%LOCALAPPDATA%\forga.space\BrowserHub`，卸载默认不删数据（勾选"删除应用数据"才删）。
  通过自定义 NSIS 模板 + 安装钩子实现，升级 tauri-cli 时需同步官方模板。
- 安装版启动实测：窗口正常、读取同一份数据。
- 注意：构建/安装前需先关闭正在运行的 BrowserHub（release exe 被占用会导致编译失败）。

## 版本号与发布目录

升版本时同步修改三处（缺一不可）：

1. `package.json` — `version`
2. `src-tauri/Cargo.toml` — `[package] version`
3. `src-tauri/tauri.conf.json` — `version`

`src-tauri/Cargo.lock` 与 `package-lock.json` 随构建/`npm version` 更新。
改完后执行 `npm run dist`，产物在 `release/v<版本>/`；**不要复用旧版本号**
（否则 `release-collect.cjs` 会覆盖同版本目录）。

**发布纪律**：`npm run dist` 只构建和收集，**不会安装、也不会复制到
`D:\Tool\BrowserHub` 等安装目录**。安装由人工运行 `setup.exe`；
结束 BrowserHub 不影响任何 Chrome 环境。
