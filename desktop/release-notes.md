# HermesAI Desktop v0.1.0 (Windows)

Hermes AI 研究指挥中心的 Windows 桌面版（Electron + NSIS）。下载 `HermesAI Setup 0.1.0.exe` 双击安装即可，三套运行时全自带、点开即用。

## 安装

1. 下载 `HermesAI Setup 0.1.0.exe`
2. 双击安装（可自选安装目录）
3. 从桌面/开始菜单启动 HermesAI

> 安装包约 129 MB，内含前端 SSR、后端、FastClaw 网关、内置 Node v22 运行时。

## 架构（三套运行时，由 Electron 主进程编排）

| 运行时 | 端口 | 说明 |
|--------|------|------|
| 后端 Hono + better-sqlite3 | 8787 | 用随包内置 Node v22 运行，原生 ABI 匹配 |
| 前端 TanStack Start SSR | 15173 | 自包含 Node SSR 产物 |
| FastClaw 网关 | 18953 | 首次启动从内置快照播种 agents + 凭据 |

用户数据（SQLite / PDF / 日志）写入 `%APPDATA%\HermesAI`，不污染安装目录。

## 本次包含的健壮性修复

1. **端口防误连**：启动前 TCP 探测 8787，被外部占用则报错退出，避免误连开发后端的数据库；smoke 校验 HermesAI 进程存活
2. **健康检查严格化**：后端只认 HTTP 200，并修掉超时连接导致的 Promise 泄漏（窗口永不出现）
3. **子进程清理**：退出时用 `spawnSync taskkill` 同步杀整棵进程树，无残留

## 已知限制

- 打包版后端用 8787，**不能与开发用后端同时运行**
- 未做数字签名（首次运行可能有 SmartScreen 提示）
- 单实例锁未启用
