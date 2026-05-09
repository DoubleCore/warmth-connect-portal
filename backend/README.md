# warmth-connect-backend

Hermes AI 后端服务。基于设计文档 `Design_Backend.md` 实现，覆盖论文库、论文分析、RAG 问答、设备管理、论文复现情况管理四个模块。

## 技术栈

- Node.js 20+
- Hono（Web 框架）
- Drizzle ORM + better-sqlite3（SQLite）
- zod（请求校验与 DTO 类型来源）
- pino（结构化日志）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量
cp .env.example .env

# 3. 生成并应用迁移（首次需要先 generate 再 migrate）
npm run db:generate
npm run db:migrate

# 4. 写入示例数据（可选）
npm run db:seed

# 5. 启动开发服务器
npm run dev
```

服务默认监听 `http://localhost:8787`，健康检查：`GET /health`。

## 目录结构

```
backend/
├── src/
│   ├── app.ts                # Hono 应用装配
│   ├── server.ts             # Node 服务入口
│   ├── config/
│   │   └── env.ts            # 环境变量（zod 校验）
│   ├── db/
│   │   ├── client.ts         # better-sqlite3 + Drizzle 客户端
│   │   ├── schema.ts         # 全部表结构
│   │   ├── migrate.ts        # 迁移脚本
│   │   ├── seed.ts           # 示例数据
│   │   └── migrations/       # drizzle-kit 生成的迁移 SQL
│   ├── modules/
│   │   ├── papers/           # 论文 + 论文分析
│   │   ├── rag/              # RAG 对话与消息
│   │   ├── devices/          # 设备管理
│   │   └── reproduction/     # 论文复现情况
│   └── shared/
│       ├── errors.ts         # 统一错误类型
│       ├── pagination.ts     # 分页工具
│       ├── logger.ts         # pino 实例
│       └── id.ts             # UUID 生成
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## API 一览

| Method | Path | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/papers` | 论文列表（支持 keyword / field / source / year / page / pageSize） |
| POST | `/api/papers` | 新建论文 |
| GET | `/api/papers/:paperId/detail` | 论文详情 + 结构化分析 |
| PATCH | `/api/papers/:paperId/analysis` | 更新论文结构化分析（upsert） |
| GET | `/api/papers/:paperId/pdf` | PDF 下载（本地文件优先，否则 302 到 pdfUrl） |
| GET | `/api/papers/:paperId/rag/conversations` | 指定论文的会话列表 |
| POST | `/api/papers/:paperId/rag/conversations` | 新建会话 |
| GET | `/api/rag/conversations/:conversationId/messages` | 会话消息列表 |
| POST | `/api/rag/conversations/:conversationId/messages` | 发送问题（stub 回答） |
| GET | `/api/devices` | 设备列表 |
| POST | `/api/devices` | 新建设备 |
| PATCH | `/api/devices/:deviceId` | 更新设备 |
| DELETE | `/api/devices/:deviceId` | 删除设备 |
| GET | `/api/reproduction-records` | 复现记录列表（联表论文与设备） |
| POST | `/api/reproduction-records` | 新建复现记录 |
| PATCH | `/api/reproduction-records/:recordId` | 更新复现记录 |
| DELETE | `/api/reproduction-records/:recordId` | 删除复现记录 |

## 说明

- RAG 回答当前是占位实现（`rag.service.ts#buildStubAnswer`），后续对接真实 RAG 服务只需替换该函数。
- `papers.authors` 以 JSON 字符串存储在 SQLite，仓储层自动 parse，对外暴露 `string[]`。
- PDF 下载优先读取本地 `PDF_STORAGE_DIR/<pdfStoragePath>`，不存在则重定向到远端 `pdfUrl`。
- UUID 在应用层通过 `crypto.randomUUID()` 生成。

## 响应契约

所有业务接口都使用统一信封，便于前端做类型收敛。

### 成功响应

```json
{ "success": true, "data": <payload> }
```

特例：
- `DELETE` 成功返回 `204 No Content`，无响应体。
- `GET /api/papers/:id/pdf` 返回二进制流或 302 重定向，不使用信封。

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND" | "VALIDATION_ERROR" | "CONFLICT" | "HTTP_ERROR" | "INTERNAL_ERROR",
    "message": "human-readable message",
    "details": "optional, e.g. zod field errors",
    "requestId": "same as X-Request-Id response header"
  }
}
```

### 请求追踪

每个请求都带 `X-Request-Id` 响应头。客户端也可以通过请求头主动指定该 id，后端会透传。服务端日志里每条记录都带同一个 `requestId`，方便从前端错误弹窗直接定位后端日志。
