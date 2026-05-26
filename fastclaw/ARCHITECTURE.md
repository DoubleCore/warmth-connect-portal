# FastClaw Integration

This directory vendors the extracted FastClaw Go agent kernel and the three Hermes paper agents used by the portal.

## Bundled Agents

| Agent ID | Name | Portal role |
| --- | --- | --- |
| `agt_f908ad32af3120090a37` | 论文搜索助手 | `FASTCLAW_AGENT_RESEARCHER` |
| `agt_18b2eb56cb44f511848e` | RAG 论文阅读助手 | `FASTCLAW_AGENT_PAPER_ANALYSE` |
| `agt_44d05b7677054cebfdad` | 论文部署助手 | `FASTCLAW_AGENT_DEPLOY` |

Agent homes live under `agents/<agent-id>/agent`. Their skill packs were migrated from `C:\Users\AORUS\.fastclaw\agents`.

`runtime-data/`, `workspaces/`, and `agents/*/agent/memory/logs/` are intentionally ignored by git. They hold local FastClaw database/log/session snapshots such as `fastclaw.db`, `gateway.log`, and historical conversation workspaces.

## Run Locally

From the repository root on Windows:

```bat
fastclaw\start-hermes-fastclaw.bat
```

The script reads local LLM settings from `backend\.env` when present:

- `LLM_API_KEY` -> `AGENT_API_KEY`
- `LLM_API_BASE_URL` -> `AGENT_API_BASE`
- `LLM_CHAT_MODEL` -> `AGENT_MODEL`
- `FASTCLAW_API_KEY` -> HTTP bearer token expected by the backend client

The server listens on `http://127.0.0.1:18953`, matching `backend/src/config/env.ts` and `backend/.env.example`.

## HTTP Surface

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /api/chat/stream`

The portal selects an agent with `X-Fastclaw-Agent-Id`. The request body may also use `agent_id` or `agentId` depending on endpoint shape.

## Build

```powershell
cd fastclaw
go build -o dist\hermes-fastclaw.exe .\cmd\hermes-fastclaw\
```

The older `cmd/agent` entrypoint remains as a minimal single-agent example. Use `cmd/hermes-fastclaw` for the portal.
