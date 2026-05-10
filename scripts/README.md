# Hermes 联调脚本

本目录里的小脚本用于 backend 联调时快速验证 Hermes `API_SERVER_*` 环境。

## 前置

在 `~/.hermes/.env` 里确认：

```
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=<random-hex>
```

改完必须 `hermes gateway restart` 让新 env 生效。

## 脚本

### `probe_hermes_run.sh`
跑一次 "请自我介绍" 级别的非工具 run,抓取 SSE 事件流。用于验证 `message.delta` / `reasoning.available` / `run.completed` 三个基线事件。

### `probe_hermes_tool_run.sh`
跑一次触发终端工具调用的 run,抓取 `tool.started` / `tool.completed` 的真实 payload 形状。

## 已确认的 Hermes Runs SSE 事件清单

基于 `/home/lyn/.hermes/hermes-agent/gateway/platforms/api_server.py` 源码 + 实测抓包。

**帧格式**:`/v1/runs/{id}/events` 每一帧都是 `data: <json>\n\n`,**不含 `event:` 行**。事件名在 JSON payload 的 `event` 字段里。

| event | payload 字段 | 触发条件 |
|---|---|---|
| `message.delta` | `{run_id, timestamp, delta}` | agent 文本 token 流 |
| `reasoning.available` | `{run_id, timestamp, text}` | 一次推理/工具调用结束后发的"整段思考总结" |
| `tool.started` | `{run_id, timestamp, tool, preview}` | agent 开始调用一个工具 |
| `tool.completed` | `{run_id, timestamp, tool, duration, error}` | 工具执行结束(error=bool) |
| `approval.request` | `{run_id, timestamp, choices:["once","session","always","deny"], ...}` | 工具调用需要用户审批 |
| `approval.responded` | `{run_id, timestamp, choice, resolved}` | 审批已提交后的确认回执 |
| `run.completed` | `{run_id, timestamp, output, usage:{input_tokens,output_tokens,total_tokens}}` | run 正常结束 |
| `run.failed` | `{run_id, timestamp, error}` | run 异常失败 |
| `run.cancelled` | `{run_id, timestamp}` | `/stop` 生效 |

## Runs 控制面 endpoints

| 方法 路径 | 作用 |
|---|---|
| `POST /v1/runs` | 创建 run → `{run_id, status:"started"}` |
| `GET /v1/runs/{id}` | 快照,含 `status / output / usage / last_event / session_id` |
| `GET /v1/runs/{id}/events` | SSE,见上表 |
| `POST /v1/runs/{id}/stop` | 中断 → `{run_id, status:"stopping"}` |
| `POST /v1/runs/{id}/approval` | body: `{choice: "once"\|"session"\|"always"\|"deny", all?:bool}`;只有 run 处于 `waiting_for_approval` 时可用 |

## 与我们项目 `CommandStreamEvent` 的映射

设计文档 §6 定义的 7 类前端事件对应如下:

| 前端事件 | 来源 Hermes 事件 | 备注 |
|---|---|---|
| `thinking` | `reasoning.available` | 把 `text` 放进 `message` |
| `agent_message` | `message.delta` 聚合 | 把多个 delta 拼成一条整消息,或直接按 delta 透传(二选一,先聚合保持前端简单) |
| `tool_start` | `tool.started` | `toolName=tool`, `displayName=tool`(Hermes 不发 displayName,前端自己做 i18n) |
| `tool_result` | `tool.completed` | `summary` 根据 `error/duration` 生成,Hermes 不给 result 细节 |
| `need_confirmation` | `approval.request` | `confirmationId` 映射 `run_id + nonce`,`payload` 原样透传 approval 数据 |
| `final` | `run.completed` | `result = {output, usage}` |
| `error` | `run.failed` / 流异常 | `code=HERMES_AGENT_ERROR`, `message=error` |
