# Hermes AI — Windows Desktop (Electron) 打包

把 Hermes AI（前端 SSR + 后端 Hono + FastClaw 网关）打包成 Windows NSIS 安装包，
并提供一条命令完成「构建 → 打包 → 安装 → 启动 → smoke test → 收日志 → 卸载」闭环。

实现遵循根目录 `WINDOWS_PACKAGING_ENGINEERING_LOOP_v0.1.md`，并按本项目真实架构做了调整。

## 一条命令验收

```bash
cd desktop
npm install            # 仅首次：装 electron + electron-builder
npm run cycle:win      # 完整闭环（唯一正式验收入口）
```

`cycle:win` 通过即代表安装包从构建到安装再到运行的闭环成立。

## 架构（与模板的差异）

模板假设「一个 MyApp.exe + 静态前端 + backend.exe」，本项目是**三套运行时**：

| 运行时 | 形态 | 桌面端口 | 打包方式 |
|--------|------|----------|----------|
| 前端   | TanStack Start **SSR**（非静态 SPA） | 15173 | `cloudflare:false` + `ssr.noExternal:true` 的自包含 Node SSR 产物，用 `@hono/node-server` 托管 |
| 后端   | Hono + better-sqlite3（原生模块） | 8787 | 编译 `dist` + 生产依赖；**用随包内置的 Node v22 运行**，原生 ABI 匹配，免 electron-rebuild |
| FastClaw | 官方 Go 二进制 | 18953 | 直接复制 `fastclaw.exe`，可选（缺失不致命） |

Electron 主进程负责：定位 `process.resourcesPath` 下的资源 → 跑 DB 迁移 → 用内置 Node
拉起后端与前端 SSR → 可选拉起 FastClaw → 轮询 `/health` → 退出时杀光子进程。
用户数据（SQLite / PDF / 日志）写入 `app.getPath("userData")`（`%APPDATA%\HermesAI`），
绝不写安装目录。

## 关键改动（修掉的真实坑）

- `backend/package.json` build：加 `tsc-alias`（`tsc` 不重写 `@/*` 别名，编译产物原本无法直接 `node` 运行）
  + `scripts/copy-assets.mjs`（`tsc` 不复制 `.sql` 迁移文件）。
- `fronted/vite.config.electron.ts`：Node SSR 专用配置，关掉 Cloudflare 插件并 `ssr.noExternal:true`
  让 SSR 产物自包含（默认会把 react / @tanstack / h3-v2 外置，纯 Node 下报 ERR_MODULE_NOT_FOUND）。
- 不使用 `requestSingleInstanceLock`：硬杀进程会留下卡死的锁导致后续启动直接退出；v0.1 不需要单实例。

## 目录

```
desktop/
  electron/
    main.js              # 主进程：编排三套运行时 + 生命周期 + 日志
    preload.js           # 安全桥（contextIsolation）
    frontend-server.mjs  # SSR 托管器：静态资源 + fetch handler
  scripts/
    prepare-resources.mjs  # 构建三端 + 内置 node + 暂存到 resources-staged/
    cycle-win.ps1          # 总控闭环
    smoke-check.ps1        # 探测 backend:8787/health + frontend:15173
    kill-app.ps1           # 清理 HermesAI / fastclaw / 本项目 electron / 目标 node
    collect-logs.ps1       # 复制 %APPDATA%\HermesAI\logs → logs/runtime
  electron-builder.yml     # NSIS assisted installer + extraResources
  package.json
```

## 单步命令

```bash
npm run prepare:resources   # 只构建 + 暂存资源
npm run build:win           # 只打 NSIS（需先 prepare）
npm run package:win         # prepare + build
```

## 日志

- Electron 主进程：`%APPDATA%\HermesAI\logs\main.log`
- 后端 / 前端 / FastClaw：同目录 `backend.log` / `frontend.log` / `fastclaw.log`
- 每轮 `cycle:win` 会复制到 `desktop/logs/runtime/`

## 已知范围（v0.1）

仅做最小闭环：未含数字签名、自动更新、单实例、完整 UI 自动化、应用图标。
这些留给 v0.2 / v0.3。
