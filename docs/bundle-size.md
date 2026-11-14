# 体积分析

记录产物实测尺寸与归因，供后续对比回归（例如新增功能后体积异常膨胀可对照此表）。

## 实测数据（v0.1.0）

| 产物 | 体积 | 说明 |
| --- | --- | --- |
| NSIS 安装包 | 1.9 MiB | LZMA 压缩后的分发尺寸 |
| release exe | 4.9 MB | 完整应用：业务 + SQLite + HTTP + FFI，前端已嵌入 |
| debug exe | 17.3 MB | 未优化、含符号（对比用） |
| 嵌入前端 | ~380 KB | React 产物（340KB JS + 37KB CSS），编译进 exe |

体积开关：`src-tauri/Cargo.toml` → `lto = true`、`strip = true`、`opt-level = "s"`、`codegen-units = 1`。debug → release 的差距主要来自这里。

## 为什么这么小（归因排序）

1. **不打包浏览器内核（最大头）**。Electron 每个应用自带完整 Chromium（80–150MB 起步）；Tauri 复用系统 WebView2（Windows 自带），内核 0 体积。
2. **Rust 无运行时**。无 GC、无 VM、无 Node 运行时，静态链接直接出机器码。
3. **编译期优化**。见上表 `Cargo.toml` 配置。
4. **依赖密度**。SQLite 是编译进去的 C 库（~1MB），无 ORM/框架样板。

## 结论

对比同功能 Electron 应用（100MB+），约 95% 的体积差距来自"复用系统 WebView"这一架构决策；
Rust 的贡献是让剩余几 MB 没有水分（同等功能 Go/C# 打包通常 10–30MB）。
即：**Tauri 决定下限，Rust 保证密度**。

## 回归警戒线

当前 4.9MB 为基准。新增 Tauri plugin、引入重型 crate（如 tokio 全特性、image 处理）时
若 release exe 涨幅超过 ~2MB，应先 `cargo bloat --release` 定位再合并。
