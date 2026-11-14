# ADR-0001：安装器程序目录与数据目录分离

日期：2026-11-15 · 状态：已实施并实测

## 背景

Tauri 2 NSIS `currentUser` 模式的默认安装位置是 `%LOCALAPPDATA%\BrowserHub`——与我们的应用数据目录（`%LOCALAPPDATA%\BrowserHub\manager.db` 等）**完全同一路径**。导致：

- 程序文件（exe / uninstall.exe）和应用数据（db / config / logs）混在同一目录；
- 卸载器 `RMDir $INSTDIR` 会把数据一起删掉（卸载即重置，违背"卸载默认不丢数据"的常见预期）；
- 与主流布局（Chrome、VS Code 用户版：程序在 `%LOCALAPPDATA%\Programs\`，数据在 `%LOCALAPPDATA%\<App>`）不一致。

用户明确要求：程序目录与数据目录必须分开；交互安装时可选目录且自动追加项目名（NSIS `InstallDir` placeholder 机制天然支持）。

## 决定

1. **自定义 NSIS 模板**（`src-tauri/installer/installer.nsi`，基于 tauri-cli v2.12.4 官方模板逐字拷贝），
   仅改动 currentUser 分支的默认安装路径：
   `StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"`（原为 `$LOCALAPPDATA\${PRODUCTNAME}`）。
2. **安装钩子**（`src-tauri/installer/hooks.nsh`）：
   - `NSIS_HOOK_POSTINSTALL`：DetailPrint 记录分离布局（文档锚点）。
   - `NSIS_HOOK_PREUNINSTALL`：当用户在卸载确认页勾选"删除应用数据"时，
     `RmDir /r "$LOCALAPPDATA\BrowserHub"`——让原生勾选项真正覆盖我们的数据目录
     （原生逻辑只清 `$APPDATA/$LOCALAPPDATA\<bundle id>`，即 WebView2 数据）。
3. `tauri.conf.json` → `bundle.windows.nsis` 增加 `template` 与 `installerHooks` 两个字段。
4. 数据目录本身（`%LOCALAPPDATA%\BrowserHub`）**不变**——`AppPaths::resolve()` 用 `LOCALAPPDATA` 环境变量解析，
   与安装位置无关，旧用户数据天然兼容，无需迁移。

## 后果

- ✅ 程序：`%LOCALAPPDATA%\Programs\BrowserHub\`（仅 exe + 卸载器）；数据：`%LOCALAPPDATA%\BrowserHub\`（仅 db/config/logs）。
- ✅ 卸载默认只删程序目录，数据保留；勾选"删除应用数据"时才连数据一起删。
- ✅ 交互安装出现目录选择页，用户改目录后自动追加 `\BrowserHub`。
- ⚠️ 模板是**锁定 cli v2.12.4 行为**的快照：升级 `@tauri-apps/cli` 时必须 diff 官方 installer.nsi 并同步本模板（文件头已注明来源 tag）。
- ⚠️ 安装器会优先读取注册表 `HKCU\Software\BrowserHub\BrowserHub` 记录的上次安装位置
  （`RestorePreviousInstallLocation`）。从旧版升级的用户会继续装到旧位置——如需强制迁移需另写逻辑（本次未做，
  本机测试时手动清了该注册表值）。

## 备选方案（未采用）

- `installMode: "perMachine"`：装 Program Files，但需要管理员权限，与本地工具类应用定位不符。
- `installMode: "both"`：让用户选 per-user/per-machine，交互更复杂且始终要求提权。
- WiX/MSI：模板改动更大，且 NSIS 已满足需求。
