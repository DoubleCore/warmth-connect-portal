# FastClaw Agent Runtime

可复用的 AI Agent 运行时模块，从 FastClaw 提取。任何 Go 项目引入即可获得完整的 ReAct Agent 能力。

## Hermes 三 Agent 迁移

本目录已经随 `warmth-connect-portal` 迁入 FastClaw Go 内核和三个论文相关 agent：

| Agent ID | 助手 | 后端环境变量 |
|----------|------|--------------|
| `agt_f908ad32af3120090a37` | 论文搜索助手 | `FASTCLAW_AGENT_RESEARCHER` |
| `agt_18b2eb56cb44f511848e` | RAG 论文阅读助手 | `FASTCLAW_AGENT_PAPER_ANALYSE` |
| `agt_44d05b7677054cebfdad` | 论文部署助手 | `FASTCLAW_AGENT_DEPLOY` |

项目内运行入口是 `cmd/hermes-fastclaw`，配置文件是 `config/hermes-agents.json`。Windows 本地启动：

```bat
fastclaw\start-hermes-fastclaw.bat
```

更多边界说明见 `ARCHITECTURE.md`。

## 当前使用方式

### warmth-connect-portal 后端集成

当前 `warmth-connect-portal` 后端（Hono + Drizzle + SQLite，端口 8787）通过 **HTTP 直连** 方式对接本机运行的 FastClaw Agent 运行时：

```
warmth-connect-portal (TypeScript/Hono :8787)
    │
    │  POST /v1/chat/completions (OpenAI 兼容)
    ▼
FastClaw Runtime (Go :18953)
    │
    │  ReAct Loop → Tool Calls → LLM
    ▼
LLM Provider (OpenAI / Anthropic / DeepSeek / ...)
```

**关键配置** (`.env`)：
```env
FASTCLAW_BASE_URL=http://127.0.0.1:18953
FASTCLAW_API_KEY=fc_xxx
FASTCLAW_TIMEOUT_MS=180000
FASTCLAW_AGENT_ID=agt_44d05b7677054cebfdad
FASTCLAW_AGENT_DEPLOY=agt_44d05b7677054cebfdad
FASTCLAW_AGENT_PAPER_ANALYSE=agt_18b2eb56cb44f511848e
FASTCLAW_AGENT_RESEARCHER=agt_f908ad32af3120090a37
```

**后端 FastClaw 模块** (`src/modules/fastclaw/`)：
- `fastclaw.client.ts` — HTTP 客户端，对接 `/v1/chat/completions`（支持流式 SSE）
- `fastclaw.service.ts` — 业务层（对话 + 论文部署助手）
- `fastclaw.routes.ts` — 路由（`/api/fastclaw/chat`, `/api/fastclaw/chat/stream`, `/api/fastclaw/deploy/stream`）
- `fastclaw.dto.ts` — 请求/响应类型定义

**后端 API 端点**：
| 端点 | 说明 |
|------|------|
| `POST /api/fastclaw/chat` | 非流式对话 |
| `POST /api/fastclaw/chat/stream` | 流式对话 (SSE) |
| `POST /api/fastclaw/deploy/stream` | 论文部署助手 (SSE) |
| `GET /api/fastclaw/ping` | 健康检查 |

**已配置的 Agent**：
| Agent ID | 用途 | 环境变量 |
|----------|------|----------|
| `agt_44d05b7677054cebfdad` | 论文部署助手 | `FASTCLAW_AGENT_DEPLOY` |
| `agt_18b2eb56cb44f511848e` | 论文解析 | `FASTCLAW_AGENT_PAPER_ANALYSE` |
| `agt_f908ad32af3120090a37` | 论文研究/阅读 | `FASTCLAW_AGENT_RESEARCHER` |

### 后端数据库表结构（SQLite, Drizzle ORM）

| 表名 | 用途 |
|------|------|
| `papers` | 论文基础信息 (title, authorsJson, abstract, repoUrl, pdfUrl...) |
| `paper_analysis` | 论文结构化分析 |
| `devices` | 设备管理 (name, deviceType, status, location) |
| `paper_reproduction_records` | 复现记录 (paperId, deviceId, status, progress, trainingNotes) |
| `rag_papers` | RAG 知识库 |
| `rag_paper_embeddings` | 向量缓存 |
| `commands` | 指令记录 |
| `command_events` | 指令事件流 |

### 后端 REST API

**论文**：`GET/POST /api/papers`, `PATCH /api/papers/:id`, `POST /api/papers/:id/pdf`
**设备**：`GET/POST /api/devices`, `PATCH/DELETE /api/devices/:id`
**复现记录**：`GET/POST /api/reproduction-records`, `PATCH/DELETE /api/reproduction-records/:id`
**RAG**：`POST /api/rag/query`, `GET /api/rag/search`

---

## 本仓库：提取的可复用 Agent 模块

本仓库是从 FastClaw 完整平台中提取的**纯 Agent 引擎**，可独立于 FastClaw 平台使用。

### 目录结构

```
.
├── agentcore/          # 接口层（零依赖）
├── agentruntime/       # 引擎层（ReAct 循环 + 工具 + Provider）
├── connector/          # 连接层（平台适配 + 工厂）
└── examples/           # 使用示例
    ├── standalone-agent/   # 最小可用 Agent
    └── http-agent/         # 嵌入 HTTP 服务器
```

### 快速开始

```go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/fastclaw-ai/agentcore"
    "github.com/fastclaw-ai/connector"
)

func main() {
    platform := connector.NewSimplePlatform()
    factory := connector.NewAgentFactory(platform)

    agent := factory.CreateAgent(agentcore.AgentConfig{
        ID:                "my-agent",
        Model:             "openai/gpt-4o-mini",
        MaxTokens:         4096,
        Temperature:       0.7,
        MaxToolIterations: 10,
        Home:              "./agent-data",
        Workspace:         "./workspace",
        Providers: map[string]agentcore.ProviderConfig{
            "openai": {
                APIKey:  os.Getenv("OPENAI_API_KEY"),
                APIBase: "https://api.openai.com/v1",
            },
        },
    })

    reply := agent.HandleMessage(context.Background(), agentcore.InboundMessage{
        Channel: "cli",
        ChatID:  "session-1",
        Text:    "你好",
    })
    fmt.Println(reply)
}
```

### 注册自定义工具

```go
agent.Registry().Register("my_tool", "描述", schema, func(ctx context.Context, args json.RawMessage) (string, error) {
    // 你的工具逻辑
    return "结果", nil
})
```

### 三层架构

| 层 | 包 | 职责 | 依赖 |
|---|---|---|---|
| 1 | `agentcore` | 接口 + 类型 | 零 |
| 2 | `agentruntime` | ReAct 引擎 + 工具 + Provider | agentcore |
| 3 | `connector` | 平台适配 + 工厂 | agentcore + agentruntime |

### 内置工具

| 工具 | 功能 |
|------|------|
| `exec` | 执行 Shell 命令 |
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `list_dir` | 列出目录 |
| `web_fetch` | HTTP 请求 |

### 支持的 LLM Provider

- **OpenAI-compatible**: GPT-4o, DeepSeek, Ollama, OpenRouter, Groq, Mistral
- **Anthropic Messages API**: Claude 4, Claude Sonnet

## 两种使用方式

### 方式 1：HTTP 对接（当前 warmth-connect-portal 的方式）

运行完整的 FastClaw 二进制（`fastclaw` 命令），通过 OpenAI 兼容 API 对接：

```typescript
// TypeScript 后端直接 fetch
const res = await fetch("http://127.0.0.1:18953/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": "Bearer fc_xxx" },
  body: JSON.stringify({ model: "agt_xxx", messages, stream: true }),
});
```

### 方式 2：Go 嵌入（本仓库提供的方式）

直接在你的 Go 后端中嵌入 Agent 引擎，无需运行独立进程：

```go
import "github.com/fastclaw-ai/agentruntime"

agent := agentruntime.NewAgent(opts)
reply := agent.HandleMessage(ctx, msg)
```

适用于：
- 想把 Agent 能力嵌入已有 Go 服务
- 不想运行独立的 FastClaw 进程
- 需要深度定制 Agent 行为（自定义工具、自定义 Provider）

