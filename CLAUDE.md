# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目愿景

Hermes AI（又称 Openpaper / Warmth Connect Portal）是一个面向科研人员的**研究指挥中心**（Research Command Center），提供论文管理、语义搜索（RAG）、GPU 训练任务监控和 AI 对话等能力。

## 架构总览

Monorepo 结构，前后端 + AI Agent 运行时各自独立构建和运行：

```
warmth-connect-portal/
├── fronted/    # 前端：TanStack Start + React 19 + Tailwind v4 + shadcn/ui
├── backend/    # 后端：Hono + Drizzle ORM + SQLite + zod
├── fastclaw/   # AI Agent 运行时：Go（ReAct 引擎 + 三个论文 Agent）
└── scripts/    # Hermes 联调脚本（check_db.sh / probe_hermes_*.sh）
```

### 前端技术栈（fronted/）

- **框架**：TanStack Start（SSR 全栈框架）+ React 19
- **构建**：Vite 7，通过 `@lovable.dev/vite-tanstack-config` 预配置
- **部署**：Cloudflare Workers（`@cloudflare/vite-plugin` + `wrangler.jsonc`）
- **样式**：Tailwind CSS v4（oklch 色彩体系，深色主题优先）+ shadcn/ui (new-york style)
- **状态**：TanStack Query + React 局部 state
- **路由**：TanStack Router 文件路由（`src/routes/` → 自动生成 `routeTree.gen.ts`）
- **包管理**：Bun

### 后端技术栈（backend/）

- **框架**：Hono（轻量 Web 框架）
- **ORM**：Drizzle ORM + better-sqlite3（SQLite）
- **校验**：zod（请求校验与 DTO 类型来源）
- **日志**：pino（结构化日志）
- **运行时**：Node.js 20+，tsx watch 开发热重载
- **SSH**：ssh2（跨平台远程服务器管理，CLI + 可编程 API）

### FastClaw Agent 运行时（fastclaw/）

- **运行时**：官方 FastClaw v0.45.0 单一二进制（`fastclaw/.upgrade/fastclaw.exe`）
  - 旧的 Go 源码 fork（`cmd/hermes-fastclaw` + agentcore/agentruntime/connector）已弃用，**不要再用 `go run` 启动**
- **协议**：OpenAI 兼容 `/v1/chat/completions` + Web Chat `/api/chat/stream`（SSE）
- **端口**：默认 `:18953`
- **数据目录（FASTCLAW_HOME）**：`C:/Users/AORUS/.fastclaw`（SQLite + agents + skills 都在这里）
- **三个 Agent**（ID 与 backend `.env` 一一对应）：
  - `agt_f908ad32af3120090a37` researcher 论文搜索助手
  - `agt_18b2eb56cb44f511848e` paperanalyse RAG 论文阅读助手
  - `agt_44d05b7677054cebfdad` deploy 论文部署助手
  - 三者当前都用 `anthropic/claude-opus-4-7`（via packyapi 代理，key 已配置）
- **启动**：`cd fastclaw && FASTCLAW_HOME="C:/Users/AORUS/.fastclaw" FASTCLAW_ALLOW_HOST_EXEC=true ./.upgrade/fastclaw.exe gateway --port 18953`
  - **`FASTCLAW_ALLOW_HOST_EXEC=true` 必带**：本机没装 Docker Desktop，默认 docker 沙箱后端起不来，会导致 agent 的 `exec`（curl/python/ssh）全部失败、卡在"docker 不在 PATH"。该变量开启 `host_exec` 逃生口，让 agent 直接在 Windows 宿主执行命令（官方设计的回退路径，沙箱不可用时提示 "retry with the host_exec tool instead"）。裸启动（不带此变量）会踩回 docker 沙箱的坑。
  - 其他可选沙箱开关：`FASTCLAW_SANDBOX_ENABLED=false`（彻底关沙箱）、`FASTCLAW_SANDBOX_BACKEND=docker|e2b|boxlite`（切后端）。`FASTCLAW_DEPLOY=hosted` 会强制禁用 host_exec（本地部署不受影响）。
- **管理**：`fastclaw.exe agents ls` / `agents config <name> get|set` / `apikey list|rotate`；Web Dashboard 在 http://localhost:18953（admin 登录）

## 开发命令

### 前端（在 fronted/ 目录下）

```bash
bun install          # 安装依赖
bun run dev          # Vite dev server
bun run build        # 生产构建
bun run build:dev    # 开发模式构建
bun run preview      # 预览生产构建
bun run lint         # ESLint 检查
bun run format       # Prettier 格式化
```

### 后端（在 backend/ 目录下）

```bash
npm install          # 安装依赖
npm run dev          # tsx watch 启动开发服务器（默认 :8787）
npm run build        # tsc 编译到 dist/
npm run start        # 运行编译后的生产构建
npm run lint         # ESLint 检查
npm run format       # Prettier 格式化
npm run db:generate  # 从 schema.ts 生成 Drizzle 迁移
npm run db:migrate   # 应用迁移到 SQLite
npm run db:seed      # 写入示例数据
npm run db:studio    # Drizzle Studio 可视化
npm run ssh -- -i <ip> -u <user> -p <pass> exec "<cmd>"  # SSH 直连执行命令
npm run ssh:list     # 列出已配置的 SSH 服务器
npm run ssh:test     # 测试所有 SSH 连接
```

### FastClaw Agent 运行时（在 fastclaw/ 目录下）

```bash
# 官方 v0.45.0 单一二进制，FASTCLAW_HOME 必须指向已配置 3 个 agent 的数据目录
# FASTCLAW_ALLOW_HOST_EXEC=true 必带：本机无 Docker，开启 host_exec 宿主执行逃生口（否则 exec 全失败）
FASTCLAW_HOME="C:/Users/AORUS/.fastclaw" FASTCLAW_ALLOW_HOST_EXEC=true ./.upgrade/fastclaw.exe gateway --port 18953
./.upgrade/fastclaw.exe agents ls                          # 列出 agent + ID
./.upgrade/fastclaw.exe apikey list                        # 列出 API key
# 旧的 `start-hermes-fastclaw.bat` / `go run ./cmd/hermes-fastclaw` 已弃用
```

### Hermes 联调脚本（在根目录 scripts/ 下）

```bash
bash scripts/check_db.sh              # 打印 SQLite 所有表行数和最近数据
bash scripts/probe_hermes_run.sh      # 验证 Hermes SSE 基线事件
bash scripts/probe_hermes_tool_run.sh # 验证工具调用事件 payload
```

### 后端环境配置

```bash
cd backend && cp .env.example .env   # 创建环境变量
```

关键变量：
- **核心**：`PORT`（8787）、`DATABASE_URL`（SQLite 路径）、`PDF_STORAGE_DIR`、`CORS_ORIGIN`、`LOG_LEVEL`、`NODE_ENV`
- **Hermes**：`HERMES_BASE_URL`（127.0.0.1:8642）、`HERMES_API_KEY`、`HERMES_TIMEOUT_MS`
- **FastClaw**：`FASTCLAW_BASE_URL`（127.0.0.1:18953）、`FASTCLAW_API_KEY`、`FASTCLAW_AGENT_DEPLOY` / `FASTCLAW_AGENT_PAPER_ANALYSE` / `FASTCLAW_AGENT_RESEARCHER`

## 前端架构

### 启动流程

`bun run dev` → Vite dev server → `src/start.ts`（TanStack Start 实例 + SSR 错误中间件）→ `src/router.tsx`（路由器 + QueryClient）→ `__root.tsx` Shell

### 路由结构

| 路径 | 文件 | 页面 |
|------|------|------|
| `/` | `src/routes/index.tsx` | 命令中心首页 |
| `/library` | `src/routes/library.tsx` | 论文库列表 |
| `/library/$paperId` | `src/routes/library.$paperId.tsx` | 论文详情 + AI 分析 |
| `/search` | `src/routes/search.tsx` | RAG 语义搜索 |
| `/workspace` | `src/routes/workspace.tsx` | GPU 设备与训练仪表盘 |
| `/docs` | `src/routes/docs.tsx` | 文档中心 |
| `/settings` | `src/routes/settings.tsx` | 系统设置 |

### 组件组织

- `src/components/hermes/` — 业务组件（Shell、Sidebar、TopBar、CommandPrompt）
- `src/components/ui/` — shadcn/ui 组件库（40+ 个，通过 `npx shadcn@latest add <component>` 添加）
- `src/lib/` — 工具函数与数据（`utils.ts`、`papers.ts` mock 数据、SSR 错误处理）
- `src/hooks/` — 自定义 Hooks

## 后端架构

### 模块结构

每个业务模块遵循 `routes → service → repository` 分层：

```
backend/src/modules/<module>/
├── <module>.routes.ts      # Hono 路由定义 + zod 校验
├── <module>.service.ts     # 业务逻辑
├── <module>.repository.ts  # Drizzle ORM 数据访问
└── <module>.dto.ts         # 请求/响应类型定义
```

七个模块：`papers`（论文 + 分析）、`rag`（RAG 对话）、`devices`（设备管理）、`reproduction`（论文复现）、`profile`（用户档案）、`command`（Hermes 指令中心）、`fastclaw`（FastClaw Agent 对接）

### API 路由

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| GET/POST | `/api/papers` | 论文列表/新建 |
| GET | `/api/papers/:paperId/detail` | 论文详情 + 结构化分析 |
| PATCH | `/api/papers/:paperId/analysis` | 更新论文分析（upsert） |
| POST/GET | `/api/papers/:paperId/pdf` | PDF 上传/下载 |
| GET/POST | `/api/papers/:paperId/rag/conversations` | 论文 RAG 会话 |
| GET/POST | `/api/rag/conversations/:conversationId/messages` | RAG 消息 |
| CRUD | `/api/devices` | 设备管理 |
| CRUD | `/api/reproduction-records` | 复现记录 |
| GET/PATCH | `/api/profile` | 用户档案 |
| POST | `/api/command/sessions` | 创建指令会话 |
| POST | `/api/command` | 提交自然语言指令 |
| GET (SSE) | `/api/command/:commandId/stream` | 指令事件流 |
| POST | `/api/fastclaw/chat/stream` | FastClaw 流式对话 |
| POST | `/api/fastclaw/deploy/stream` | 论文部署助手（SSE） |

### 关键约定

- RAG 回答当前为 stub 实现（`rag.service.ts#buildStubAnswer`），替换该函数即可对接真实 RAG 服务
- `papers.authors` 以 JSON 字符串存储在 SQLite，仓储层自动 parse/stringify
- PDF 下载优先本地 `PDF_STORAGE_DIR`，不存在则 302 重定向到远端 `pdfUrl`
- 应用装配在 `src/app.ts`，错误处理统一通过 `AppError` 和 `ZodError` 分类
- FastClaw 通过 OpenAI 兼容协议（`/v1/chat/completions`）对接，`model` 字段传 Agent ID
- 后端本地 import 必须带 `.js` 扩展名（ESM 语义，如 `@/config/env.js`）

## 编码规范

### 前端

- **ESLint**：`typescript-eslint` 推荐 + React Hooks + React Refresh + Prettier
  - 禁止 `server-only` 包；`no-unused-vars` 关闭；`react-refresh/only-export-components` 为 warn
- **Prettier**：`printWidth: 100`，双引号，分号，尾逗号 `all`
- **路径别名**：`@/*` → `./src/*`
- **CSS**：所有颜色必须用 oklch 格式；新颜色需在 `styles.css` 的 `@theme inline` + `:root` / `.dark` 中同步注册
- **组件**：shadcn/ui → `src/components/ui/`；业务组件 → `src/components/hermes/`
- **路由**：文件路由，新页面在 `src/routes/` 新建 `.tsx`，导出 `Route` 常量

### 后端

- **Prettier**：同前端配置
- **路径别名**：`@/*` → `./src/*`（tsconfig paths，需 `.js` 扩展名导入）
- **模块分层**：routes → service → repository，DTO 类型与 zod schema 共存于 `.dto.ts`
- **错误处理**：`AppError`（业务错误）+ `ZodError`（校验错误）+ Hono HTTPException

## AI 使用指引

- `src/routeTree.gen.ts` 自动生成，不要手动修改
- `vite.config.ts` 使用 `@lovable.dev/vite-tanstack-config`，不要重复添加已被该包包含的插件
- 应用默认深色模式（`<html lang="en" className="dark">`）
- 前端 SSR 错误处理链路：`error-capture.ts` → `error-page.ts` → `server.ts` → `start.ts`
- 前端数据通过 `src/api/*` 调用后端 API（`apiFetch` 封装在 `src/lib/api-client.ts`）
- 后端 `src/config/env.ts` 集中校验所有环境变量
- `fastclaw/` 目录下的 Go 代码和 Agent 配置独立于 TypeScript 项目，修改后需重启 FastClaw 进程
- 不要提交 `.env`、本地 SQLite 文件、`PDF_STORAGE_DIR` 中的文件或 `scripts/ssh/config.yaml`
