# Hermes 指令中心 HTTP 直连可用版设计

## 1. 设计结论

本项目 MVP 阶段采用 **Backend 与 Hermes 同机 HTTP 对接方案**。

```text
前端发送消息
  ↓
后端接收消息
  ↓
后端通过 HTTP 调用 Hermes Agent
  ↓
Hermes Agent 执行并返回信息
  ↓
后端接收 Hermes 返回
  ↓
后端通过 SSE 或普通 HTTP 返回给前端
  ↓
前端展示 Agent 状态和结果
```

核心原则：

```text
Frontend 不直接连接 Hermes
Frontend 只连接 Backend
Backend 直接通过 HTTP 调用本机 Hermes
Hermes 的所有输出都必须先回到 Backend
Backend 再把结果推送给 Frontend
```

---

## 2. 部署假设

本设计基于以下实际情况：

```text
Frontend：浏览器页面
Backend：业务后端服务
Hermes：Agent 服务

Backend 和 Hermes 部署在同一台服务器上。
```

因此 Backend 调用 Hermes 时可以直接使用 localhost 地址：

```env
HERMES_BASE_URL=http://127.0.0.1:8642
HERMES_TIMEOUT_MS=120000
```

如 Hermes 后续改成其他端口或路径，只需要调整 Backend 的环境变量，不影响前端。

---

## 3. 总体架构

```text
Frontend Command Center
        │
        │ 1. POST 用户自然语言消息
        ▼
Backend Command API
        │
        │ 2. 创建 commandId，保存用户消息
        ▼
Command Orchestrator
        │
        │ 3. HTTP 调用 Hermes Agent
        ▼
Hermes Agent Service
        │
        │ 4. 返回 Agent 消息、工具状态、最终结果
        ▼
Backend CommandStreamService
        │
        │ 5. 转成前端统一事件
        ▼
Frontend Command Center
```

Backend 是前端和 Hermes 之间的唯一桥梁。

---

## 4. 最小可用链路

### 4.1 非流式最小链路

第一阶段先保证非流式调用可用。

```text
Frontend POST message
  ↓
Backend 收到 message
  ↓
Backend HTTP POST 给 Hermes
  ↓
Hermes 返回 JSON
  ↓
Backend 返回 final result
  ↓
Frontend 展示结果
```

这个阶段不强制做工具过程展示，只要能完成：

1. 前端发消息
2. 后端收到消息
3. Hermes 收到消息
4. Hermes 返回结果
5. 前端看到结果

即可认为主链路跑通。

### 4.2 流式增强链路

第二阶段再增加 SSE。

```text
Frontend POST message
  ↓
Backend 返回 commandId + streamUrl
  ↓
Frontend 打开 EventSource
  ↓
Backend 调 Hermes stream 接口
  ↓
Backend 边收到 Hermes 输出，边转成 SSE 推给前端
  ↓
Frontend 实时展示 Agent 状态和最终结果
```

---

## 5. 前端接口设计

前端只调用 Backend，不知道 Hermes 的实际地址。

### 5.1 创建指令会话

```http
POST /api/command/sessions
```

请求：

```json
{
  "entry": "home",
  "initialContext": {
    "paperId": null,
    "trainingListId": null,
    "deviceId": null
  }
}
```

响应：

```json
{
  "sessionId": "cmd_sess_123",
  "createdAt": "2026-05-09T10:00:00Z"
}
```

---

### 5.2 发送自然语言消息

```http
POST /api/command/sessions/{sessionId}/messages
```

请求：

```json
{
  "message": "帮我分析这篇论文，生成任务定义、研究问题、方法概述和指标。",
  "context": {
    "currentPage": "paper_detail",
    "paperId": "paper_123"
  }
}
```

响应：

```json
{
  "commandId": "cmd_123",
  "status": "running",
  "streamUrl": "/api/command/commands/cmd_123/stream"
}
```

说明：

- 前端发送消息后，Backend 立即创建 `commandId`。
- Backend 不需要等待 Hermes 全部执行完再响应。
- 前端拿到 `streamUrl` 后，通过 SSE 接收后续状态。

---

### 5.3 接收执行状态流

```http
GET /api/command/commands/{commandId}/stream
```

建议使用 SSE。

前端示例：

```ts
const eventSource = new EventSource(`/api/command/commands/${commandId}/stream`);

eventSource.addEventListener("thinking", (event) => {
  const data = JSON.parse(event.data);
  appendMessage(data.message);
});

eventSource.addEventListener("agent_message", (event) => {
  const data = JSON.parse(event.data);
  appendMessage(data.message);
});

eventSource.addEventListener("tool_start", (event) => {
  const data = JSON.parse(event.data);
  showToolStart(data.displayName);
});

eventSource.addEventListener("tool_result", (event) => {
  const data = JSON.parse(event.data);
  showToolResult(data.summary);
});

eventSource.addEventListener("final", (event) => {
  const data = JSON.parse(event.data);
  showFinalResult(data.result);
  eventSource.close();
});

eventSource.addEventListener("error", (event) => {
  const data = JSON.parse(event.data);
  showError(data.message);
  eventSource.close();
});
```

---

## 6. 前端事件类型

前端统一接收 Backend 推送的事件，不直接处理 Hermes 原始事件。

```ts
type CommandStreamEvent =
  | {
      type: "thinking";
      message: string;
    }
  | {
      type: "agent_message";
      message: string;
    }
  | {
      type: "tool_start";
      toolName: string;
      displayName: string;
    }
  | {
      type: "tool_result";
      toolName: string;
      summary: string;
      result?: unknown;
    }
  | {
      type: "need_confirmation";
      confirmationId: string;
      message: string;
      payload: unknown;
    }
  | {
      type: "final";
      message?: string;
      result: unknown;
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };
```

---

## 7. Backend 调用 Hermes 的 HTTP 设计

Backend 和 Hermes 之间直接 HTTP 对齐。

### 7.1 环境变量

```env
HERMES_BASE_URL=http://127.0.0.1:8642
HERMES_TIMEOUT_MS=120000
```

如果 Hermes 需要 token：

```env
HERMES_API_KEY=local-dev-key
```

---

### 7.2 Backend 调 Hermes 非流式接口

建议 Hermes 提供一个最简单的接口：

```http
POST /agent/message
```

完整地址：

```http
POST http://127.0.0.1:8642/agent/message
```

请求：

```json
{
  "commandId": "cmd_123",
  "sessionId": "cmd_sess_123",
  "message": "帮我分析这篇论文，生成任务定义、研究问题、方法概述和指标。",
  "context": {
    "currentPage": "paper_detail",
    "paperId": "paper_123",
    "userId": "user_123"
  }
}
```

响应：

```json
{
  "commandId": "cmd_123",
  "status": "completed",
  "message": "分析完成。",
  "result": {
    "paperId": "paper_123",
    "summary": "论文摘要内容",
    "taskDefinition": "任务定义",
    "researchQuestion": "研究问题",
    "methodOverview": "方法概述",
    "metrics": ["Accuracy", "F1-score", "AUC"]
  }
}
```

Backend 收到后转成前端 final 事件：

```text
event: final
data: {"message":"分析完成。","result":{"paperId":"paper_123"}}
```

---

### 7.3 Backend 调 Hermes 流式接口

当非流式跑通后，再增加流式接口。

建议 Hermes 提供：

```http
POST /agent/message/stream
```

完整地址：

```http
POST http://127.0.0.1:8642/agent/message/stream
```

请求：

```json
{
  "commandId": "cmd_123",
  "sessionId": "cmd_sess_123",
  "message": "帮我分析这篇论文，生成任务定义、研究问题、方法概述和指标。",
  "context": {
    "currentPage": "paper_detail",
    "paperId": "paper_123",
    "userId": "user_123"
  },
  "stream": true
}
```

Hermes 返回 HTTP stream 或 SSE。

示例 Hermes 原始事件：

```text
event: agent_message
data: {"message":"正在理解你的指令..."}

event: tool_start
data: {"toolName":"paper.analysis","displayName":"分析论文"}

event: tool_result
data: {"toolName":"paper.analysis","summary":"已完成论文结构化分析"}

event: final
data: {"message":"分析完成","result":{"paperId":"paper_123"}}
```

Backend 读取 Hermes stream 后，可以原样转发兼容事件，也可以标准化后再推给前端。

推荐标准化后再推给前端，避免前端依赖 Hermes 的内部格式。

---

## 8. Backend 内部模块

MVP 阶段只需要保留必要模块。

```text
Command Backend
├── CommandController
├── CommandSessionService
├── CommandOrchestrator
├── HermesHttpClient
├── CommandStreamService
└── CommandLogService
```

### 8.1 CommandController

负责接收前端请求：

```text
POST /api/command/sessions
POST /api/command/sessions/{sessionId}/messages
GET  /api/command/commands/{commandId}/stream
```

### 8.2 CommandOrchestrator

负责主流程：

```text
1. 接收用户 message
2. 创建 command 记录
3. 组装 Hermes 请求
4. 调用 HermesHttpClient
5. 接收 Hermes 返回
6. 写入日志
7. 通过 CommandStreamService 推给前端
```

### 8.3 HermesHttpClient

负责 Backend 和 Hermes 的 HTTP 通信。

建议接口：

```ts
interface HermesHttpClient {
  sendMessage(input: HermesMessageInput): Promise<HermesMessageResult>;
  streamMessage(input: HermesMessageInput): AsyncIterable<HermesRawEvent>;
}
```

类型：

```ts
type HermesMessageInput = {
  commandId: string;
  sessionId: string;
  message: string;
  context: Record<string, unknown>;
};

type HermesMessageResult = {
  commandId: string;
  status: "completed" | "failed";
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};
```

---

## 9. Hermes 原始事件到前端事件的映射

| Hermes 原始事件 | Backend 前端事件 | 说明 |
|---|---|---|
| `agent_message` | `agent_message` | Agent 普通消息 |
| `thinking` | `thinking` | 正在理解或处理中 |
| `tool_start` | `tool_start` | 工具开始执行 |
| `tool_result` | `tool_result` | 工具执行结果 |
| `need_confirmation` | `need_confirmation` | 需要用户确认 |
| `final` | `final` | 最终结果 |
| `error` | `error` | 错误信息 |

Backend 的职责不是重新实现 Hermes，而是保证：

```text
Hermes 输出任何东西
  ↓
Backend 能接住
  ↓
Backend 能转成前端认识的事件
  ↓
Frontend 能展示
```

---

## 10. 用户确认机制

MVP 阶段可以先只对高风险操作做确认。

需要确认的操作：

```text
创建训练任务
删除训练列表
批量修改论文列表
下发设备任务
覆盖已有分析结果
```

确认流程：

```text
Hermes 返回 need_confirmation
  ↓
Backend 创建 confirmationId
  ↓
Backend 推送 need_confirmation 给前端
  ↓
Frontend 展示确认卡片
  ↓
用户点击确认或取消
  ↓
Frontend POST confirmation 结果给 Backend
  ↓
Backend 再决定是否继续调用 Hermes 或内部服务
```

确认接口：

```http
POST /api/command/confirmations/{confirmationId}
```

请求：

```json
{
  "action": "confirm"
}
```

或：

```json
{
  "action": "cancel"
}
```

---

## 11. 最小数据库记录

MVP 阶段不需要设计过重，但至少要记录 command。

### 11.1 commands

```sql
CREATE TABLE commands (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID,
  user_message TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  context JSONB,
  result JSONB,
  error JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

状态：

```text
pending
running
waiting_confirmation
completed
failed
cancelled
```

### 11.2 command_events

建议记录事件，便于前端重连和排查问题。

```sql
CREATE TABLE command_events (
  id UUID PRIMARY KEY,
  command_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

当 SSE 断开后，前端可以重新连接，Backend 可以基于 `command_events` 补发历史事件。

---

## 12. 错误处理

### 12.1 Hermes 无法连接

```json
{
  "type": "error",
  "code": "HERMES_CONNECTION_FAILED",
  "message": "后端无法连接 Hermes 服务，请确认 Hermes 是否已启动。"
}
```

### 12.2 Hermes 超时

```json
{
  "type": "error",
  "code": "HERMES_TIMEOUT",
  "message": "Hermes 执行超时，请稍后重试。"
}
```

### 12.3 Hermes 返回错误

```json
{
  "type": "error",
  "code": "HERMES_AGENT_ERROR",
  "message": "Hermes Agent 执行失败。"
}
```

### 12.4 用户取消

```json
{
  "type": "final",
  "status": "cancelled",
  "message": "已取消本次操作。"
}
```

---

## 13. 最小安全边界

本项目当前重点是保证可用，不引入复杂安全隔离。

但仍建议保留以下最小边界：

```text
1. Frontend 不直接连接 Hermes
2. Hermes 只监听本机地址或内网地址
3. Hermes 地址只配置在 Backend 环境变量中
4. 所有用户消息必须先进入 Backend
5. 所有 Hermes 输出必须先回 Backend，再推送给 Frontend
6. 删除、覆盖、设备下发等高风险操作仍需确认
```

这不是为了复杂安全，而是为了保证系统可控、可排查、可维护。

---

## 14. 开发顺序

### 第一阶段：跑通非流式闭环

目标：必须能用。

```text
Frontend 输入消息
  ↓
Backend 接收消息
  ↓
Backend POST Hermes /agent/message
  ↓
Hermes 返回 JSON
  ↓
Backend 返回 final
  ↓
Frontend 展示结果
```

完成标准：

```text
用户在前端输入一句话，最终能看到 Hermes 返回的结果。
```

---

### 第二阶段：增加 SSE 流式展示

目标：前端能看到 Agent 过程。

```text
Backend 调 Hermes /agent/message/stream
Backend 接收 Hermes stream
Backend 转发 SSE 给前端
Frontend 展示 thinking、tool_start、tool_result、final
```

完成标准：

```text
用户能看到“正在理解指令 / 正在调用工具 / 已完成”等过程状态。
```

---

### 第三阶段：增加确认卡片

目标：高风险操作不直接执行。

```text
Hermes 返回 need_confirmation
Backend 推给 Frontend
Frontend 展示确认卡片
用户确认后 Backend 继续执行
```

完成标准：

```text
创建训练任务、设备下发等操作必须用户确认。
```

---

### 第四阶段：增加日志和重连

目标：方便排查问题。

```text
记录 command
记录 command_events
SSE 断开后可以重连
失败时可以查日志
```

完成标准：

```text
任意一次用户指令都能查到输入、状态、Hermes 返回和最终结果。
```

---

## 15. 联调检查清单

### 15.1 检查 Hermes 是否可访问

```bash
curl http://127.0.0.1:8642/health
```

期望：

```json
{
  "status": "ok"
}
```

如果 Hermes 没有 `/health`，可以换成你们实际实现的健康检查接口。

---

### 15.2 检查 Backend 能否调用 Hermes

```bash
curl -X POST http://127.0.0.1:8642/agent/message \
  -H "Content-Type: application/json" \
  -d '{
    "commandId":"cmd_test_001",
    "sessionId":"cmd_sess_test_001",
    "message":"你好 Hermes，请返回一段测试消息。",
    "context":{}
  }'
```

期望：

```json
{
  "commandId": "cmd_test_001",
  "status": "completed",
  "message": "...",
  "result": {}
}
```

---

### 15.3 检查前端到 Backend

```bash
curl -X POST http://localhost:3000/api/command/sessions/cmd_sess_test_001/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message":"你好 Hermes，请测试前后端链路。",
    "context":{"currentPage":"home"}
  }'
```

期望：

```json
{
  "commandId": "cmd_123",
  "status": "running",
  "streamUrl": "/api/command/commands/cmd_123/stream"
}
```

---

### 15.4 检查 SSE

```bash
curl -N http://localhost:3000/api/command/commands/cmd_123/stream
```

期望：

```text
event: thinking
data: {"message":"正在理解你的指令..."}

event: final
data: {"message":"完成","result":{}}
```

---

## 16. 最终实现目标

本设计最终要保证四件事：

```text
1. 前端发出的消息，Backend 一定能收到。
2. Backend 收到消息后，一定能通过 HTTP 发给 Hermes。
3. Hermes 返回的 Agent 消息、工具状态、最终结果，Backend 一定能收到。
4. Backend 收到 Hermes 输出后，一定能通过 SSE 或 HTTP 返回给前端展示。
```

这就是 Hermes 指令中心 MVP 的核心闭环。

---

## 17. 最终推荐一句话

```text
本项目 MVP 阶段采用 Backend 与 Hermes 同机 HTTP 直连方案。
Frontend 只连接 Backend。
Backend 负责接收前端消息、调用 Hermes HTTP 接口、接收 Hermes 输出，并通过 SSE 转发给 Frontend。
```
