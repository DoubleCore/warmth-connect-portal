# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目愿景

Hermes AI（又称 Openpaper / Warmth Connect Portal）是一个面向科研人员的**研究指挥中心**（Research Command Center），提供论文管理、语义搜索（RAG）、GPU 训练任务监控和 AI 对话等能力。

## 架构总览

Monorepo 结构，前后端分离，各自独立构建和运行：

```
warmth-connect-portal/
├── fronted/    # 前端：TanStack Start + React 19 + Tailwind v4 + shadcn/ui
└── backend/    # 后端：Hono + Drizzle ORM + SQLite + zod
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
```

### 后端环境配置

```bash
cd backend && cp .env.example .env   # 创建环境变量
```

关键变量：`PORT`（8787）、`DATABASE_URL`（SQLite 路径）、`PDF_STORAGE_DIR`、`CORS_ORIGIN`、`LOG_LEVEL`、`NODE_ENV`

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

四个模块：`papers`（论文 + 分析）、`rag`（RAG 对话）、`devices`（设备管理）、`reproduction`（论文复现）

### API 路由

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| GET/POST | `/api/papers` | 论文列表/新建 |
| GET | `/api/papers/:paperId/detail` | 论文详情 + 结构化分析 |
| PATCH | `/api/papers/:paperId/analysis` | 更新论文分析（upsert） |
| GET | `/api/papers/:paperId/pdf` | PDF 下载 |
| GET/POST | `/api/papers/:paperId/rag/conversations` | 论文 RAG 会话 |
| GET/POST | `/api/rag/conversations/:conversationId/messages` | RAG 消息 |
| CRUD | `/api/devices` | 设备管理 |
| CRUD | `/api/reproduction-records` | 复现记录 |

### 关键约定

- RAG 回答当前为 stub 实现（`rag.service.ts#buildStubAnswer`），替换该函数即可对接真实 RAG 服务
- `papers.authors` 以 JSON 字符串存储在 SQLite，仓储层自动 parse/stringify
- PDF 下载优先本地 `PDF_STORAGE_DIR`，不存在则 302 重定向到远端 `pdfUrl`
- 应用装配在 `src/app.ts`，错误处理统一通过 `AppError` 和 `ZodError` 分类

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
- 前端当前数据为硬编码 mock（`src/lib/papers.ts`），后续将接入后端 API
- 后端 `src/config/env.ts` 集中校验所有环境变量
- 不要提交 `.env`、本地 SQLite 文件或 `PDF_STORAGE_DIR` 中的文件
