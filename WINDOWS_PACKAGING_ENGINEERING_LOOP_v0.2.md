# Hermes AI Windows 安装包工程化循环规范 v0.2（项目专属）

> 本文是 `WINDOWS_PACKAGING_ENGINEERING_LOOP_v0.1.md`（通用模板）针对 **Hermes AI / Warmth Connect Portal** 项目的落地版。
> v0.1 用的是 `MyApp` / `backend.exe` / `models` / `tools` / `17891` 这类占位符；本版全部替换为本项目**实测验证过的真实值**，并固化了实现过程中踩过的坑与关键决策。
> 路线：Electron + electron-builder + NSIS assisted installer，三套运行时（SSR 前端 + Hono 后端 + FastClaw 网关）共用一份随包内置的 Node v22。
> 状态：**v0.2 闭环已实测通过**（`npm run cycle:win` → `==== CYCLE PASSED ====`），产物 `HermesAI Setup 0.1.0.exe`（约 126 MB）。

---

## 0. 总原则

与 v0.1 一致：建立可重复、可验证、可回溯的工程闭环。任何修改都不以"代码看起来没问题"为验收标准，必须以 `npm run cycle:win` 实跑结果为准。

```text
代码修改 → 自动构建 → 生成安装包 → 安装到测试目录 → 启动安装后的软件
        → 执行 smoke test → 收集日志 → 根据日志修复 → 再次构建
```

---

## 1. 本项目与通用模板的关键差异（必读）

v1 模板假设"一个 `MyApp.exe` + 静态前端 + `backend.exe` + 本地模型 + ffmpeg/python"。Hermes AI 完全不同，差异如下：

| 维度 | v0.1 模板假设 | Hermes AI 实情 |
|------|--------------|----------------|
| 应用名 | `MyApp` | **`HermesAI`**（productName），appId `com.hermesai.desktop` |
| 前端 | 静态 SPA，`file://index.html` | **TanStack Start SSR**（非静态），必须由 Node 进程托管 |
| 后端 | 单文件 `backend.exe` | **Hono + better-sqlite3**，编译产物 `dist/` + 生产依赖，用内置 Node 运行 |
| 模型 | `resources/models/*.onnx` | **无本地模型**（LLM 走云端 API：DeepSeek/Claude）→ 该目录不适用 |
| 工具 | `resources/tools/ffmpeg,python` | **无 ffmpeg/python**；唯一外部运行时是 **FastClaw Go 二进制** → 用 `resources/fastclaw/` 取代 `tools/` |
| 后端 health | `GET /api/health` `:17891` | **`GET /health`** `:18787`（代码里真实存在的端点与端口） |
| Node 运行时 | 未涉及 | **随包内置系统 Node v22**（`resources/node/node.exe`），原生 ABI 匹配，免 electron-rebuild |
| 单实例 | 模板未要求 | **明确不用** `requestSingleInstanceLock`（见 §13 坑 4） |

---

## 2. 第一版验收目标（按本项目改写）

必须验收（`cycle:win` 全部覆盖并实测通过）：

```text
1.  前端可以正常 build（Node SSR 产物 dist/client + dist/server）。
2.  后端可以正常 build（tsc + tsc-alias + 复制 .sql 迁移）。
3.  Electron 可以正常 package。
4.  NSIS 安装包可以生成（HermesAI Setup 0.1.0.exe）。
5.  安装包可以静默安装到指定测试目录。
6.  安装后存在 HermesAI.exe。
7.  安装后存在 resources/node/node.exe（内置 Node 运行时）。
8.  安装后存在 resources/backend/dist/server.js + better-sqlite3 原生 .node + dist/db/migrations。
9.  安装后存在 resources/frontend/frontend-server.mjs + dist/server/server.js。
10. 安装后存在 resources/fastclaw/fastclaw.exe（可选，缺失不致命）。
11. 启动 HermesAI.exe 后，后端在 :18787 启动。
12. 后端 GET /health 返回 200。
13. 前端 SSR 在 :15173 返回 200 + HTML。
14. 关闭主程序后，backend/frontend 的 node 进程不残留（实测 0 orphan）。
15. 卸载程序可以执行，安装目录被清空。
16. 每轮失败有日志可查（%APPDATA%\HermesAI\logs + desktop/logs/runtime）。
```

**不适用（本项目没有对应物，非失败）：**

```text
- resources/models：本项目无本地模型文件。
- resources/tools（ffmpeg/python）：本项目无此类工具；其位置由 resources/fastclaw 取代。
```

暂不做（留待 v0.3+）：数字签名、自动更新、应用图标、单实例锁、完整 UI 自动化、业务接口级 smoke。

---

## 3. 实际项目目录

```text
warmth-connect-portal/
├── fronted/                          # 前端（TanStack Start SSR）
│   ├── src/
│   ├── vite.config.ts                # 默认 Cloudflare 构建（线上部署用）
│   └── vite.config.electron.ts       # ★ 桌面专用 Node SSR 构建配置
│
├── backend/                          # 后端（Hono + better-sqlite3）
│   ├── src/
│   ├── scripts/copy-assets.mjs       # ★ tsc 后复制 .sql 迁移到 dist
│   └── package.json                  # build 脚本含 tsc-alias（见 §13 坑 1）
│
├── fastclaw/.upgrade/fastclaw.exe    # FastClaw 官方 Go 二进制（主仓库内）
│
└── desktop/                          # ★ 桌面打包工作区（本次新增）
    ├── electron/
    │   ├── main.js                   # 主进程：编排三套运行时 + 生命周期 + 日志
    │   ├── preload.js                # 安全桥（contextIsolation）
    │   └── frontend-server.mjs       # SSR 托管器：静态资源 + fetch handler
    ├── scripts/
    │   ├── prepare-resources.mjs     # 构建三端 + 内置 node + 暂存 resources-staged/
    │   ├── cycle-win.ps1             # 总控闭环（唯一正式验收入口）
    │   ├── smoke-check.ps1          # 探测 :18787/health + :15173
    │   ├── kill-app.ps1             # 清理 HermesAI / fastclaw / 本项目 electron / 目标 node
    │   └── collect-logs.ps1         # 复制运行日志到 logs/runtime
    ├── electron-builder.yml          # NSIS assisted installer + extraResources
    ├── package.json
    ├── resources-staged/             # （构建产物，.gitignore）
    ├── release/                      # （安装包输出，.gitignore）
    └── logs/                         # （收集到的日志，.gitignore）
```

安装后的运行时布局（`<install>/resources/`）：

```text
<install>/
├── HermesAI.exe
└── resources/
    ├── app.asar                      # 仅 Electron 壳（electron/ + package.json）
    ├── node/node.exe                 # 内置 Node v22
    ├── backend/                       # dist/ + 生产 node_modules + package.json
    ├── frontend/                      # frontend-server.mjs + dist/ + package.json(type:module)
    └── fastclaw/fastclaw.exe          # 可选
```

---

## 4. package.json 脚本规范（desktop/）

```json
{
  "name": "hermes-desktop",
  "main": "electron/main.js",
  "scripts": {
    "prepare:resources": "node scripts/prepare-resources.mjs",
    "build:win": "electron-builder --win --x64",
    "package:win": "npm run prepare:resources && npm run build:win",
    "cycle:win": "powershell -ExecutionPolicy Bypass -File scripts/cycle-win.ps1"
  },
  "devDependencies": {
    "electron": "^33.2.1",
    "electron-builder": "^25.1.8"
  }
}
```

唯一正式验收入口：

```bash
cd desktop && npm run cycle:win
```

每轮修改后必须跑它，不能只跑 `prepare:resources` 或 `build:win`——只构建成功不代表安装后可运行。

---

## 5. electron-builder.yml 规范（真实配置）

```yaml
appId: com.hermesai.desktop
productName: HermesAI

directories:
  output: release
  buildResources: build

# 只把 Electron 壳放进 app.asar；三套运行时和内置 Node 走 extraResources，
# 以保住原生二进制和磁盘文件布局。
files:
  - electron/**/*
  - package.json

asar: true

extraResources:
  - from: resources-staged/node
    to: node
    filter: ["**/*"]
  - from: resources-staged/backend
    to: backend
    filter: ["**/*"]
  - from: resources-staged/frontend
    to: frontend
    filter: ["**/*"]
  - from: resources-staged/fastclaw
    to: fastclaw
    filter: ["**/*"]

win:
  target:
    - target: nsis
      arch: [x64]

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: HermesAI
  uninstallDisplayName: HermesAI

forceCodeSigning: false
```

资源放置原则：

```text
前端 SSR 产物 + 托管器  → extraResources/frontend
后端 dist + 生产依赖    → extraResources/backend
内置 Node 运行时        → extraResources/node
FastClaw 二进制         → extraResources/fastclaw（取代模板的 tools/）
用户运行数据            → %APPDATA%\HermesAI（app.getPath("userData")）
```

禁止：把 backend/frontend/node/fastclaw 塞进 app.asar；把用户数据写进安装目录。

---

## 6. Electron 主进程要求（electron/main.js 实现）

主进程职责：

```text
1. app.setName("HermesAI") —— 固定 userData 落到 %APPDATA%\HermesAI。
2. 通过 process.resourcesPath（packaged）/ ../resources-staged（dev）定位资源。
3. 跑 DB 迁移（resources/backend/dist/db/migrate.js）。
4. 用内置 Node 拉起后端（dist/server.js）→ :18787。
5. 用内置 Node 拉起前端 SSR（frontend-server.mjs）→ :15173。
6. 可选拉起 FastClaw（fastclaw.exe gateway --port 18953），缺失不致命。
7. 轮询 /health 与前端 / ，就绪后 loadURL(http://127.0.0.1:15173)。
8. 所有日志写 %APPDATA%\HermesAI\logs（main/backend/frontend/fastclaw.log）。
9. before-quit / process.exit 时用 taskkill /T /F 杀光整棵子进程树。
```

路径规则（已实现）：

```js
function resourcesRoot() {
  if (app.isPackaged) return process.resourcesPath;        // <install>/resources
  return path.join(__dirname, "..", "resources-staged");   // dev
}
const NODE_BIN = path.join(RES, "node", "node.exe");
```

固定桌面端口（与 dev 环境 8787/5173/18953 隔离，避免冲突）：

```js
const BACKEND_PORT  = 18787;   // 后端 /health
const FRONTEND_PORT = 15173;   // 前端 SSR
const FASTCLAW_PORT = 18953;   // FastClaw 网关
```

后端子进程环境变量（main.js#backendEnv）：

```text
NODE_ENV=production
PORT=18787
DATABASE_URL=<userData>\data\app.db      # ★ 绝对路径，写到可写的 userData
PDF_STORAGE_DIR=<userData>\storage\pdfs
CORS_ORIGIN=http://127.0.0.1:15173
HOST_TRACKING_ENABLED=false              # 桌面端关掉 SSH 定时采集，干净启动
FASTCLAW_BASE_URL=http://127.0.0.1:18953
```

**必须**用 `process.resourcesPath` 定位；**禁止**硬编码任何开发机路径。

---

## 7. 后端 health 接口规范

后端真实端点（`backend/src/app.ts`）：

```text
GET /health
```

返回：

```json
{ "success": true, "data": { "status": "ok", "uptime": 3.65, "env": "production", "requestId": "..." } }
```

> 注意：是 `/health` 不是模板里的 `/api/health`；端口 `18787` 不是模板里的 `17891`。smoke-check 以 `http://127.0.0.1:18787/health` 返回 200 作为最小验收。

---

## 8. 前端 SSR 构建与托管（本项目核心难点）

### 8.1 构建：fronted/vite.config.electron.ts

线上默认是 Cloudflare Workers 构建，桌面端必须用专用配置切到 Node SSR：

```ts
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
export default defineConfig({
  cloudflare: false,            // 关掉 Cloudflare 插件 → 输出纯 Node fetch handler
  tanstackStart: { server: { entry: "server" } },
  vite: { ssr: { noExternal: true } },  // ★ 把所有依赖打进 SSR 产物，运行时不依赖 node_modules
});
```

构建命令（注意 `VITE_API_BASE_URL` 在**构建时**烘焙进产物，必须传桌面后端端口）：

```bash
VITE_API_BASE_URL="http://127.0.0.1:18787" \
  npx vite build --config vite.config.electron.ts
```

产物：

```text
dist/client/**          静态资源
dist/server/server.js   default export { fetch(request, env, ctx) }
```

### 8.2 托管：electron/frontend-server.mjs

自包含 Node HTTP 服务：静态文件直出，其余转给 SSR fetch handler。用后端随带的 `@hono/node-server` 桥接（路径由环境变量 `HONO_NODE_SERVER` 传入），所以前端目录**零 node_modules**。

```text
GET 静态命中 dist/client → 直接返回（带路径穿越防护 + 不可变缓存）
其余 → ssr.fetch(request, {}, {})
```

---

## 9. 自动化总控脚本：scripts/cycle-win.ps1（真实步骤）

```text
0.  kill-app.ps1（清理旧进程）
1.  清理旧测试安装目录 C:\Temp\HermesAI-E2E + release\（release 带重试，防 AV/blockmap 句柄占用）
2.  npm run prepare:resources（构建三端 + 内置 node + 暂存）
3.  npm run build:win（生成 NSIS）
4.  在 release\ 找 *Setup*.exe
5.  静默安装：Start-Process Installer /S /D=C:\Temp\HermesAI-E2E
       → ★ NSIS 安装异步，轮询到 node.exe 体积稳定（size-stable）才算落盘完成
6.  校验 8 个关键文件（exe / node / backend server+sqlite+migrations / frontend server+dist）
       → FastClaw 缺失仅告警，不报错
7.  Start-Process 启动 HermesAI.exe
8.  smoke-check.ps1（backend 200 + frontend 200+HTML）
9.  kill-app.ps1（停止）
10. 校验无 orphan：扫 node.exe 命令行含 dist\server.js / frontend-server.mjs → 有则 throw
11. collect-logs.ps1
12. 卸载：Uninstall HermesAI.exe /S
```

---

## 10. Smoke Test：scripts/smoke-check.ps1

```text
backend:  http://127.0.0.1:18787/health  → 期望 200
frontend: http://127.0.0.1:15173/         → 期望 200 且 body 含 <!doctype
两者各重试 40 次（750ms 间隔）。任一失败即 throw。
```

---

## 11. 进程清理：scripts/kill-app.ps1（本项目专属）

```text
1. 按名杀：HermesAI、fastclaw。
2. 杀本项目 node_modules\electron 下的 electron.exe
      ★ dev 模式 `electron .` 留下的实例会占用同一资源，必须清。
3. 按命令行精确杀 node.exe：含 dist\server.js / frontend-server.mjs / dist\db\migrate.js。
   —— 绝不无差别杀全部 node.exe（开发环境/工具链也在用 node）。
```

---

## 12. 日志系统

```text
Electron 主进程  → %APPDATA%\HermesAI\logs\main.log
后端 stdout/err  → %APPDATA%\HermesAI\logs\backend.log
前端 stdout/err  → %APPDATA%\HermesAI\logs\frontend.log
FastClaw         → %APPDATA%\HermesAI\logs\fastclaw.log
```

main.log 至少记录：启动时间、isPackaged、resourcesPath、NODE_BIN、USER_DATA、DB_PATH、
各子进程启动/退出码、health 结果、before-quit。主进程还挂了
`uncaughtException` / `unhandledRejection` / `whenReady().catch` 三道兜底，把静默崩溃写进日志。

`cycle:win` 第 11 步会把上述目录复制到 `desktop/logs/runtime/`。

---

## 13. 实现过程中踩过的真实坑（v0.2 新增，务必牢记）

> 这些是把通用模板落到本项目时实际遇到并已修复的问题。它们大多与"打包"无关，而是编译产物在脱离 `tsx`/`node_modules` 后才暴露的潜在 bug。

**坑 1：后端 `@/*` 路径别名编译后无法解析。**
`tsc`（NodeNext）不会重写 `@/config/env.js` 这类别名，编译产物里原样保留，纯 `node dist/server.js` 直接 `ERR_MODULE_NOT_FOUND`（此前只在 dev 用 `tsx` 跑过，从没暴露）。
→ 修复：`backend` build 脚本改为 `tsc && tsc-alias -p tsconfig.json && node scripts/copy-assets.mjs`。

**坑 2：`tsc` 不复制 `.sql` 迁移文件。**
`migrate.ts` 相对自身定位 `dist/db/migrations`，但 tsc 只编译 `.ts`，9 个 `.sql` 不会进 dist。
→ 修复：新增 `backend/scripts/copy-assets.mjs`，build 末尾把 `src/db/migrations` 复制到 `dist/db/migrations`。

**坑 3：前端 SSR 产物默认外置依赖，纯 Node 下崩。**
默认 Cloudflare 构建把 react / @tanstack / `h3-v2` / radix 全部 externalize，期望 Workers 运行时提供；放进无 node_modules 的桌面前端目录后 `ERR_MODULE_NOT_FOUND: h3-v2`。
→ 修复：`vite.config.electron.ts` 里 `ssr.noExternal: true`，把依赖全打进产物（仅 `node:` 内置保持外置）。

**坑 4：`requestSingleInstanceLock()` 会卡死后续启动。**
用 `taskkill /F` 硬杀实例后，单实例锁残留，之后每次启动 `gotLock=false` → 静默 `app.quit()`，主进程日志只停在打印路径那一行、毫无报错。排查耗时最久。
→ 修复：v0.1 直接**移除单实例锁**（非验收需求）。v0.2+ 若要单实例，必须配 stale-lock 恢复。

**坑 5：NSIS `/S /D=` 安装/卸载是异步的。**
安装返回后大文件（node.exe ~84MB、fastclaw ~43MB）还在拷贝，立刻校验会误报 `resources/node/node.exe missing`。
→ 修复：cycle 脚本等安装进程退出 + 轮询 node.exe 体积稳定，而非只等主 exe 出现。

**坑 6：`release\` 偶发被占用导致清理失败。**
AV 扫描 / blockmap 句柄会短暂占住 `release\`，`Remove-Item` 抛 IOException。
→ 修复：cycle 第 1 步对 release 删除做最多 8 次重试。

---

## 14. 每轮调试规则

沿用 v0.1 §13，并强调本项目要点：

```text
1.  每轮只做最小必要修改。
2.  每轮修改后必须运行 npm run cycle:win。
3.  失败后先读 %APPDATA%\HermesAI\logs 和终端错误，判断失败阶段再改。
4.  不允许删测试脚本 / 跳过 smoke-check / 绕过失败。
5.  不允许把 backend/frontend/node/fastclaw 塞进 app.asar。
6.  不允许硬编码开发机路径（一律 process.resourcesPath）。
7.  改了 electron/ 下的壳代码，可只重打 app.asar 快速验证；改了三端任一，需重跑 prepare:resources。
8.  连续 3 次同类失败必须停止并总结根因。
```

每轮输出格式：本轮修改 / 失败-成功位置 / 依据日志 / 下一步。

---

## 15. 错误分类表（按本项目改写）

| 失败位置 | 常见原因 | 修复方向 |
|---|---|---|
| 前端 build 失败 | TanStack/Vite 配置或类型错误 | 查 vite.config.electron.ts |
| 前端运行时 `ERR_MODULE_NOT_FOUND` | SSR 外置了依赖 | 确认 `ssr.noExternal: true`（坑 3） |
| 后端 `node` 跑不起来报 `@/...` | tsc 未重写别名 | 确认 build 含 tsc-alias（坑 1） |
| 迁移失败 `migrationsFolder` 找不到 | .sql 没进 dist | 确认 copy-assets.mjs（坑 2） |
| 安装后校验 node.exe missing | 异步安装未落盘 | size-stable 轮询（坑 5） |
| 启动后主程序秒退、日志只到路径行 | 单实例锁卡死 | 移除 requestSingleInstanceLock（坑 4） |
| backend /health 失败 | 端口/路径写错或后端崩 | 必须是 :18787 + /health；看 backend.log |
| 前端白屏 | SSR 产物缺资源或端口错 | 看 frontend.log；确认 :15173 返回 200 |
| 卸载/重装文件占用 | 进程残留 | 装/卸前后跑 kill-app.ps1 |
| 关闭后 node 残留 | 子进程未级联杀 | taskkill /T /F 整棵树 |

---

## 16. 安装目录 vs 用户数据目录

```text
安装目录（<install>/）   ：HermesAI.exe + resources/（node/backend/frontend/fastclaw）—— 只读
用户数据（%APPDATA%\HermesAI）：data/app.db、storage/pdfs、logs/、fastclaw/（FASTCLAW_HOME）—— 可写
```

`DATABASE_URL` 必须传 userData 下的**绝对路径**（`client.ts` 用 `resolve()` 解析，传相对路径会落到 cwd）。

---

## 17. 进入工程化循环的执行顺序

第一阶段（已完成）：建立最小闭环 —— `cycle:win` 通过。

第二阶段（v0.2 候选增强）：

```text
1. 应用图标（electron-builder.yml 的 win.icon）。
2. 业务级 smoke：装完后真打一个 /api/papers 或 FastClaw /v1/chat/completions。
3. 前端白屏检测（除 200 外校验 body 关键 DOM）。
4. better-sqlite3 ABI 漂移防护（CI 固定 Node 版本 / 校验 process.versions.modules）。
5. FASTCLAW_HOME 初始化（首次启动注入 3 个 agent 配置 + apikey）。
```

第三阶段（发布前）：Windows Sandbox 测试、无 Node/网络环境测试、装到 D 盘测试、升级安装、卸载残留。

---

## 18. 当前结论

v0.2 在 v0.1 模板基础上，把全部占位符替换为 Hermes AI 真实值，并固化了 6 个实测踩坑与"三套运行时共用内置 Node"的架构决策。核心验收不变：

```text
一条命令 npm run cycle:win 完整通过 = Windows 安装包从构建到安装再到运行的闭环成立。
```

已知未覆盖（诚实声明）：

```text
- 窗口的视觉渲染未自动化验证（SSR 返回 200 HTML，但"打开后画面"需真机肉眼确认）。
- smoke 仅到 HTTP 健康检查级别，未覆盖 RAG/FastClaw/PDF 等业务功能。
- 内置 Node 取自构建机 process.execPath（v22.15.1 / ABI 127），需与 better-sqlite3 预编译 .node 的 ABI 一致。
```

后续所有功能修改，都必须在 `cycle:win` 这个循环中被验证。
