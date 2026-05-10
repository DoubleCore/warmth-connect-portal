jixu[根目录](../CLAUDE.md) > **backend**

# Backend — Hermes AI 后端模块

## 模块职责

Hermes AI 研究指挥中心的服务端。基于 Hono + Drizzle ORM + SQLite，承载论文库、论文结构化分析、RAG 对话、设备管理、论文复现追踪、用户 profile、Hermes 指令中心等所有业务接口，并作为 Hermes Agent 同机 HTTP 控制面的上游代理。

## 入口与启动

| 文件                         | 说明                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/server.ts`              | Node 进程入口：`@hono/node-server` 把 `createApp()` 出来的 Hono 实例挂到 `env.PORT`，注册 SIGINT/SIGTERM 的 10 秒优雅退出                    |
| `src/app.ts`                 | 组装 Hono app：CORS、`requestId`、请求日志中间件、`/health`、所有 `/api/*` router、`notFound`/`onError` 错误统一信封                          |
| `src/config/env.ts`          | 用 zod 校验 `.env`；`corsOrigins`、`PDF_MAX_BYTES` 等派生量也放这里；校验失败直接 `process.exit(1)`                                           |
| `src/db/client.ts`           | 打开 `better-sqlite3` 连接 + 创建 Drizzle 实例（`drizzle-orm/better-sqlite3`）                                                               |
| `src/db/schema.ts`           | 所有表的 Drizzle schema 单一来源（papers / paper_analysis / rag_papers / devices / paper_reproduction_records / user_profile / commands 三张） |
| `src/db/migrate.ts`          | 运行 Drizzle 迁移（`npm run db:migrate`）                                                                                                    |
| `src/db/seed.ts`             | 示例数据（`npm run db:seed`）                                                                                                                |

启动流程：`npm run dev` → `tsx watch src/server.ts` → `env.ts` 校验环境变量 → `createApp()` 装配 Hono → `@hono/node-server` 监听 `PORT`。

## 对外接口

### 统一信封

```ts
// 成功
{ "success": true,  "data": <payload> }

// 失败（response.ts / app.ts）
{ "success": false, "error": { "code": "...", "message": "...", "details"?: ..., "requestId": "..." } }
```

- 每个响应都会带 `X-Request-Id` 响应头（由 `hono/request-id` 中间件生成或透传）
- `AppError` / `ZodError` / 带 `status` 字段的任意错误 / 兜底 500 都会被 `app.ts#onError` 统一包装

### 路由总览

| Method           | 路径                                                  | 说明                                                     |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| GET              | `/health`                                             | 存活检查（uptime / env / requestId）                     |
| GET / POST       | `/api/papers`                                         | 论文列表（分页）/ 新建                                   |
| GET              | `/api/papers/:paperId/detail`                         | 论文基础信息 + 结构化分析                                |
| PATCH            | `/api/papers/:paperId/analysis`                       | 论文分析 upsert                                          |
| POST             | `/api/papers/:paperId/pdf` (multipart)                | 上传 PDF 到 `PDF_STORAGE_DIR`                            |
| GET              | `/api/papers/:paperId/pdf`                            | 下载：有本地文件则流式返回，否则 302 到 `pdfUrl`         |
| GET / POST       | `/api/papers/:paperId/rag/conversations`              | 绑定论文的 RAG 会话                                      |
| GET / POST       | `/api/rag/conversations/:conversationId/messages`     | RAG 消息收发（当前 `buildStubAnswer` 占位）              |
| GET / POST / PATCH / DELETE | `/api/devices[/:id]`                       | 设备 CRUD                                                |
| GET / POST / PATCH / DELETE | `/api/reproduction-records[/:id]`          | 论文复现记录 CRUD                                        |
| GET / PATCH      | `/api/profile`                                        | 单行用户 profile（id 锁为 1）                            |
| POST             | `/api/command/sessions`                               | 创建指令中心会话                                         |
| POST             | `/api/command`                                        | 提交自然语言指令 → 调 Hermes Runs API                    |
| GET (SSE)        | `/api/command/:commandId/stream`                      | 订阅 `CommandStreamEvent` 事件流                         |
| POST             | `/api/command/:commandId/confirm` / `/stop`           | 审批 / 中止 Hermes run                                   |

实际 zod schema、DTO 类型、分页参数以各模块的 `*.dto.ts` 为准。

## 关键依赖与配置

### 核心依赖

| 依赖                     | 版本     | 用途                                          |
| ------------------------ | -------- | --------------------------------------------- |
| `hono`                   | ^4.6     | Web 框架                                      |
| `@hono/node-server`      | ^1.13    | Node 适配                                     |
| `@hono/zod-validator`    | ^0.4     | zod 接入 Hono validator                       |
| `drizzle-orm`            | ^0.38    | ORM                                           |
| `drizzle-kit`            | ^0.30    | 迁移 / Studio                                 |
| `better-sqlite3`         | ^11.7    | SQLite 驱动（同步 API）                       |
| `zod`                    | ^3.24    | 运行时校验 + DTO 类型来源                     |
| `pino` + `pino-pretty`   | ^9 / ^13 | 结构化日志；dev 下 pretty                     |
| `dotenv`                 | ^16.4    | `.env` 加载                                   |
| `tsx`                    | ^4.19    | dev / 迁移 / seed 的 TS 直跑                  |

### 配置文件

| 文件                        | 说明                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `drizzle.config.ts`         | `schema: src/db/schema.ts`，`out: src/db/migrations`，dialect `sqlite`，`casing: snake_case`       |
| `tsconfig.json`             | `@/*` → `./src/*`；**ESM + `moduleResolution: bundler`/`nodenext` 语义下，本地 import 必须带 `.js` 扩展名**（例如 `@/config/env.js`） |
| `.prettierrc` / `.gitignore`| 略                                                                                                |
| `.env.example`              | 所有环境变量的权威模板                                                                            |

### 环境变量（`src/config/env.ts` 校验）

| 变量                | 默认                         | 说明                                                                          |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`          | `development`                | `development` / `production` / `test`                                         |
| `PORT`              | `8787`                       | HTTP 监听端口                                                                 |
| `DATABASE_URL`      | `./data/app.db`              | SQLite 文件路径                                                               |
| `PDF_STORAGE_DIR`   | `./storage/pdfs`             | 上传 PDF 的存放目录                                                           |
| `CORS_ORIGIN`       | `*`                          | 逗号分隔的前端来源；`*` 时不发 `credentials`                                  |
| `LOG_LEVEL`         | `info`                       | pino 等级                                                                     |
| `HERMES_BASE_URL`   | `http://127.0.0.1:8642`      | Hermes Agent API Server 基址                                                  |
| `HERMES_TIMEOUT_MS` | `120000`                     | 控制面调用超时；SSE 握手成功后会解绑                                          |
| `HERMES_API_KEY`    | —                            | 对应 Hermes 侧 `API_SERVER_KEY`；启用 API Server 后必填                       |
| `PDF_MAX_BYTES`     | 26 MB（代码常量）            | 上传 PDF 的硬上限                                                             |

## 数据模型

SQLite 表结构定义在 `src/db/schema.ts`，关键约定：

- **ID**：主键统一用 `text` + 应用层 `randomUUID()`（`src/shared/id.ts`）；RAG 专用表 `rag_papers` 例外，用 `INTEGER` 自增（FTS5 external-content 要求 rowid 为整数）
- **数组**：SQLite 无原生数组，`authors_json` 一类字段以 JSON 字符串存储，repository 层 parse/stringify 后对外暴露 `string[]`
- **时间戳**：`created_at` / `updated_at` 用 `text` + `CURRENT_TIMESTAMP` 默认值，保持与其他字段格式一致
- **级联**：`paper_analysis` / `paper_reproduction_records` 对 `papers` 设 `onDelete: "cascade"`；`reproduction` 对 `devices` 设 `onDelete: "set null"`
- **FTS5**：`rag_papers_fts` 虚表 + 3 个同步 trigger 手写在 `src/db/migrations/0002_rag_fts5.sql`，**不在** Drizzle schema 里描述
- **Hermes 指令中心**：`command_sessions` / `commands` / `command_events` 三张表，PG 风格的 `UUID` / `JSONB` / `TIMESTAMPTZ` 在 SQLite 里统一降级为 `text`；`commands.hermes_run_id` 指向 Hermes Runs API 的 run，`command_events` 表同时承载当前非流式事件和 Phase 2 SSE 事件

## 后端架构

### 模块分层

每个业务模块都遵循 `routes → service → repository → dto` 四层：

```
backend/src/modules/<module>/
  <module>.routes.ts      # Hono router + zv() 校验 + response.ok/okWith/created
  <module>.service.ts     # 业务逻辑，抛 AppError/NotFoundError 等
  <module>.repository.ts  # Drizzle 查询，返回领域对象（JSON 字段已 parse）
  <module>.dto.ts         # zod schema + 从 schema 推导的 TS 类型
```

当前模块：`papers` / `rag` / `devices` / `reproduction` / `profile` / `command`（其中 `command/` 另含 `command.bus.ts`、`command.confirmations.ts`、`hermes.client.ts`）。

### 共享工具（`src/shared/`）

| 文件              | 内容                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `errors.ts`       | `AppError` 基类 + `NotFoundError` / `ValidationError` / `ConflictError`                |
| `response.ts`     | `SuccessEnvelope<T>` / `ErrorEnvelope`；`ok()` / `okWith()` / `created()` 辅助函数     |
| `validator.ts`    | `zv()`：包装 `@hono/zod-validator`，校验失败统一吐错误信封                             |
| `context.ts`      | `AppEnv` / `AppVariables`；`createRouter()` 工厂，保证 `c.get("requestId"|"logger")` 强类型 |
| `logger.ts`       | pino 基 logger；dev 下 `pino-pretty`；handler 里优先用 `c.get("logger")` 拿请求域 child |
| `id.ts`           | `newId()` 包装 `randomUUID()`                                                          |
| `pagination.ts`   | `paginationQuerySchema`（page/pageSize，默认 1/20，上限 100）+ `offset()` / `buildPagination()` |

### 请求生命周期

1. `cors()`（按 `CORS_ORIGIN` 解析允许列表）
2. `requestId()`：生成或透传 `X-Request-Id`
3. 自定义日志中间件：`baseLogger.child({ requestId })` 写到 `c.set("logger", ...)`，并在 finally 里记录 `{ method, path, status, durationMs }`
4. 业务 router → service → repository
5. `onError`：`AppError` / `ZodError` / 带 `status` 的 HTTP 错 / 兜底 500 → 各自信封

### Hermes 指令中心

- `POST /api/command` 入库 `commands` 行 → 调 `hermes.client.ts` 的 `createRun()` → 写回 `hermes_run_id`
- `GET /api/command/:commandId/stream` (SSE)：把 Hermes 事件流映射成 `CommandStreamEvent` 并持久化到 `command_events`
- `confirm` / `stop` 通过 `hermes_run_id` 反查并转发到 Hermes Runs API
- 当前非流式链路只写 `final` / `error` 两类事件；Phase 2 扩展到 `thinking` / `agent_message` / `tool_start` / `tool_result` / `need_confirmation`，表结构已预留

### RAG 模块要点

- `rag_papers` 和 `papers` 表刻意解耦：前者只存 title + abstract + authors + venue，用于 FTS5 检索
- 消息回答当前是 `rag.service.ts#buildStubAnswer` 的占位文案，替换该函数即可对接真实 RAG 链路
- FTS5 虚表通过 insert/update/delete trigger 自动同步，详见 `0002_rag_fts5.sql`

## 开发命令

```bash
npm install           # 安装依赖
npm run dev           # tsx watch src/server.ts，默认 :8787
npm run build         # tsc 编译到 dist/
npm start             # node dist/server.js
npm run lint          # eslint .
npm run format        # prettier --write .
npm run db:generate   # drizzle-kit 从 schema.ts 生成迁移
npm run db:migrate    # tsx src/db/migrate.ts 应用迁移
npm run db:seed       # tsx src/db/seed.ts 写示例数据
npm run db:studio     # drizzle-kit studio 可视化
```

## 测试与质量

- **测试**：无。无测试文件、无测试框架配置。手工验证靠 `/health` + `curl` + 前端联调。
- **Lint**：`npm run lint`（eslint + typescript-eslint）
- **格式化**：`npm run format`

## 常见问题 (FAQ)

**Q: 为什么本地 import 要写 `.js` 扩展名？**
A: `package.json` 是 `"type": "module"`，加上 `tsconfig` 的 ESM 语义，TypeScript/Node/`tsx` 都要求在导入路径里显式写**目标**扩展名（即使源文件是 `.ts`，也要写 `.js`）。路径别名 `@/config/env.js` 这种正是此原因。

**Q: `better-sqlite3` 和 Drizzle 是同步还是异步？**
A: `better-sqlite3` 的 API 是同步的，Drizzle 的包装仍把方法暴露成 Promise/可 await，业务层无感知。迁移脚本可以直接顺序跑。

**Q: 新增一张表怎么走？**
A: (1) 在 `src/db/schema.ts` 声明表 → (2) `npm run db:generate` 生成迁移 → (3) 必要时手写补充 SQL（如 FTS5 / trigger）到同目录 → (4) `npm run db:migrate` 应用 → (5) 如需示例数据改 `seed.ts`。

**Q: `CORS_ORIGIN=*` 时为什么没有 `credentials: true`？**
A: 浏览器规范不允许同时出现 `Access-Control-Allow-Origin: *` 和 `Allow-Credentials: true`。`app.ts` 里 `credentials: corsOrigins !== "*"` 自动处理。

**Q: Hermes Agent 没起来 `/api/command` 会挂吗？**
A: 会得到 `HERMES_*` 超时的 502/504 级错误，走统一 `onError` 转成 `{ success: false, error: { code, message, requestId } }`。前端 `api-client.ts` 里据此给用户兜底。

**Q: PDF 下载的逻辑？**
A: `GET /api/papers/:id/pdf` 先查 DB 的 `pdf_storage_path`：有则从 `PDF_STORAGE_DIR` 读流式返回；没有则 302 重定向到 DB 的 `pdf_url`；两者都空则 404。

## 相关文件清单

```
backend/
  package.json                      # 依赖与脚本
  tsconfig.json / .prettierrc / .gitignore
  drizzle.config.ts                 # drizzle-kit 配置
  .env.example / .env               # 环境变量（.env 不入库）
  data/app.db                       # SQLite 本地文件（不入库）
  src/
    server.ts                       # Node 入口 + graceful shutdown
    app.ts                          # Hono 装配 + 全局中间件 + onError
    config/env.ts                   # zod 校验 env + 派生常量
    db/
      client.ts                     # better-sqlite3 + Drizzle 实例
      schema.ts                     # 全部表定义 + $inferSelect/Insert 类型
      migrate.ts / seed.ts
      migrations/
        0000_colossal_princess_powerful.sql
        0001_tired_mentor.sql
        0002_rag_fts5.sql           # FTS5 虚表 + trigger（手写）
        0003_condemned_magneto.sql
        0004_commands.sql           # Hermes 指令中心 3 张表
        0005_hermes_run_id.sql
        meta/_journal.json          # drizzle-kit 管理
    shared/
      context.ts                    # AppEnv / createRouter
      errors.ts                     # AppError 及派生类
      response.ts                   # 成功/失败信封 + ok/created
      validator.ts                  # zv() 包装 @hono/zod-validator
      pagination.ts                 # page/pageSize 校验 + offset 工具
      logger.ts                     # pino baseLogger
      id.ts                         # newId()
    modules/
      papers/                       # papers CRUD + analysis upsert + PDF 上传/下载
      rag/                          # RAG 会话与消息（buildStubAnswer 占位）
      devices/                      # 设备 CRUD
      reproduction/                 # 论文复现记录 CRUD
      profile/                      # 单行 profile（id 锁为 1）
      command/                      # Hermes 指令中心：routes + service + repo
                                    #   + bus / confirmations / hermes.client
```

## 变更记录 (Changelog)

| 日期       | 操作 | 说明                                                                                                |
| ---------- | ---- | --------------------------------------------------------------------------------------------------- |
| 2026-05-10 | 创建 | 初次扫描生成，覆盖 Hono 装配、模块分层、SQLite/FTS5/Hermes 指令中心三张表、env 校验与共享工具集     |
