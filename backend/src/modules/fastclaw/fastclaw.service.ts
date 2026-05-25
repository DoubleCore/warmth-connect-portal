import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { getDeviceOrThrow } from "@/modules/devices/devices.service.js";
import * as hostRepo from "@/modules/host-tracking/host-tracking.repository.js";
import { decodePasswordForSsh } from "@/modules/host-tracking/host-tracking.service.js";
import * as paperRepo from "@/modules/papers/papers.repository.js";
import { NotFoundError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";
import type { CommandStreamEvent } from "@/modules/command/command.dto.js";
import {
  fastclawClient,
  type FastClawMessage,
  type FastClawStreamChunk,
} from "./fastclaw.client.js";
import { FastClawError } from "./fastclaw.client.js";
import { fastclawRunEventBus } from "./fastclaw.bus.js";
import * as repo from "./fastclaw.repository.js";
import type { FastClawEventRowWithSeq } from "./fastclaw.repository.js";
import type {
  CreateFastClawSessionInput,
  FastClawChatInput,
  FastClawChatResponseDto,
  FastClawDeployInput,
  FastClawRunResponseDto,
  FastClawSessionDto,
  FastClawSessionHistoryDto,
  SendFastClawMessageInput,
} from "./fastclaw.dto.js";

/**
 * FastClaw 对话服务层。
 *
 * 轻量封装：把前端 input 映射成 FastClaw 消息格式，调客户端，返回结果。
 * 不做持久化——轻量对话不需要落库（如果后续需要，可以在这里加）。
 */

export function ensureConfigured(): void {
  if (!fastclawClient.isConfigured()) {
    throw new FastClawError(
      "FASTCLAW_NOT_CONFIGURED",
      "FastClaw 服务未配置，请检查 FASTCLAW_BASE_URL。",
      503,
    );
  }
}

function buildMessages(input: FastClawChatInput): FastClawMessage[] {
  const messages: FastClawMessage[] = [];

  if (input.systemPrompt) {
    messages.push({ role: "system", content: input.systemPrompt });
  }

  if (input.history) {
    for (const turn of input.history) {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  messages.push({ role: "user", content: input.message });
  return messages;
}

/**
 * 把前端传来的 `agentRole` 白名单映射到具体 agt_xxx；agentRole 为空时回退
 * 给 client 自己的 fallback（env.FASTCLAW_AGENT_ID 或 "default"）。
 *
 * 优先级：input.agentId > input.agentRole > client fallback。直接传 agentId
 * 仍然支持，但前端的「部署对话」走 agentRole 更稳——env 里 FASTCLAW_AGENT_ID
 * 一变，agentId 不显式指定就会跟着漂，那正是 manager 出过的 bug。
 */
export function resolveAgentId(
  input: Pick<FastClawChatInput, "agentId" | "agentRole">,
): string | undefined {
  if (input.agentId) return input.agentId;
  switch (input.agentRole) {
    case "deploy":
      return env.FASTCLAW_AGENT_DEPLOY ?? undefined;
    case "analyse":
    case "reader":
      return env.FASTCLAW_AGENT_PAPER_ANALYSE ?? undefined;
    case "researcher":
    case "search":
      return env.FASTCLAW_AGENT_RESEARCHER ?? undefined;
    default:
      return undefined;
  }
}

function shouldUseWebChatStream(agentRole: FastClawChatInput["agentRole"]): boolean {
  return (
    agentRole === "deploy" ||
    agentRole === "analyse" ||
    agentRole === "reader" ||
    agentRole === "researcher" ||
    agentRole === "search"
  );
}

/**
 * 非流式对话。直接返回完整回复。
 */
export async function chat(
  input: FastClawChatInput,
  requestId: string,
  logger: Logger,
): Promise<FastClawChatResponseDto> {
  ensureConfigured();

  const messages = buildMessages(input);
  const result = await fastclawClient.chat(messages, logger, {
    agentId: resolveAgentId(input),
    sessionKey: input.sessionKey,
  });

  return {
    content: result.content,
    requestId,
    usage: result.usage,
  };
}

/**
 * 流式对话。返回 AsyncIterable<FastClawStreamChunk>。
 * 路由层负责把它转成 SSE 推给前端。
 */
export async function chatStream(
  input: FastClawChatInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  if (shouldUseWebChatStream(input.agentRole)) {
    return fastclawClient.webChatStream(input.message, logger, {
      agentId: resolveAgentId(input),
      sessionKey: input.sessionKey ?? `wcp-${input.agentRole ?? "agent"}-chat-${Date.now()}`,
    });
  }

  const messages = buildMessages(input);
  return fastclawClient.chatStream(messages, logger, {
    agentId: resolveAgentId(input),
    sessionKey: input.sessionKey,
  });
}

/**
 * 健康检查
 */
export async function ping(logger: Logger): Promise<boolean> {
  return fastclawClient.ping(logger);
}

// ---------- Deploy：论文部署助手 ----------

/**
 * 构造部署模板消息。
 *
 * 把论文信息 + 设备信息拼成一条结构化的部署指令，发给 FastClaw 论文部署助手。
 */
export async function buildDeployMessage(input: FastClawDeployInput): Promise<{
  message: string;
  systemPrompt: string;
  displayMessage: string;
}> {
  // 获取论文信息
  const paper = await paperRepo.getPaperById(input.paperId);
  if (!paper) throw new NotFoundError("Paper", input.paperId);

  // 获取设备信息
  const device = await getDeviceOrThrow(input.deviceId);

  // 获取 host 凭证
  const cred = await hostRepo.getHostCredentialById(input.deviceId);
  if (!cred) throw new NotFoundError("HostCredential", input.deviceId);

  const password = cred.encryptedPassword ? decodePasswordForSsh(cred.encryptedPassword) : null;
  const authLine = password
    ? `- 密码：${password}`
    : cred.keyFile
      ? `- 私钥路径：${cred.keyFile}`
      : "- 认证信息：未设置";
  const sshCommand = password
    ? "sshpass -p '<password>' ssh -o StrictHostKeyChecking=no -p <port> <username>@<host>"
    : "ssh -i '<keyFile>' -o StrictHostKeyChecking=no -p <port> <username>@<host>";
  const loginMode = password ? "密码" : "密钥";

  const systemPrompt = `你是一个论文代码部署助手。你的任务是帮助用户将论文的代码部署到指定的 GPU 服务器上。

## SSH 连接信息
后端已经从数据库读取并解密目标设备凭证；不要再调用公共 host-tracking API 获取 password，公共 API 不返回明文密码。
用 ${sshCommand} 连接。

## 目标设备
- 名称：${device.name}
- IP：${cred.host}
- 用户：${cred.username}
${authLine}
- SSH 端口：${cred.port}

## 工作流程
1. 用${loginMode} SSH 连接到目标设备
2. 确认 GPU 环境（nvidia-smi）
3. 克隆论文代码仓库到 ~/LHL/ 目录
4. 创建虚拟环境并安装依赖
5. 根据 README 配置训练参数
6. 启动训练（用 nohup 或 tmux 后台运行）
7. 报告部署结果

## 注意
- 连接时加 -o StrictHostKeyChecking=no
- 每完成一步都报告进度
- 遇到错误分析原因并尝试解决`;

  const repoInfo = paper.repoUrl
    ? `\n- GitHub 仓库：${paper.repoUrl}`
    : "\n- GitHub 仓库：未提供（请搜索或询问用户）";

  const message = `请帮我部署论文《${paper.title}》的代码到设备 ${device.name} (${cred.host})。

论文信息：
- 标题：${paper.title}${repoInfo}
- 作者：${JSON.parse(paper.authorsJson).join(", ") || "未知"}

目标设备：
- 名称：${device.name}
- IP：${cred.host}
- 用户：${cred.username}
- SSH 端口：${cred.port}

请按以下步骤执行：
1. SSH 连接到目标设备
2. 克隆代码仓库到合适的目录
3. 创建虚拟环境并安装依赖
4. 配置训练参数
5. 启动训练任务

如果遇到问题请告诉我。`;

  return {
    message,
    systemPrompt,
    displayMessage: `部署论文《${paper.title}》到设备《${device.name}》`,
  };
}

/**
 * 发起部署对话（非流式，因为 FastClaw streaming 对当前 LLM 后端不稳定）。
 *
 * 返回完整回复文本，由路由层包装成 SSE 推给前端。
 */
export async function deployChat(input: FastClawDeployInput, logger: Logger): Promise<string> {
  ensureConfigured();

  const { message, systemPrompt } = await buildDeployMessage(input);
  const messages = buildMessages({
    message,
    systemPrompt,
    stream: false,
  });

  logger.info(
    { paperId: input.paperId, deviceId: input.deviceId, reproductionId: input.reproductionId },
    "FastClaw deploy chat initiated (non-streaming)",
  );

  const result = await fastclawClient.chat(messages, logger, {
    agentId: env.FASTCLAW_AGENT_DEPLOY,
    sessionKey: input.sessionKey,
  });

  return result.content;
}

/**
 * 发起部署对话（FastClaw Web Chat 事件流）。
 *
 * OpenAI-compatible /v1/chat/completions 能启动部署 agent，但它不会稳定暴露
 * FastClaw Web UI 正在使用的工具事件。部署这种长任务走 /api/chat/stream，
 * 这样 Hermes 页面能看到 tool_call / tool_result / content_delta。
 */
export async function deployChatStream(
  input: FastClawDeployInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  const { message } = await buildDeployMessage(input);

  logger.info(
    { paperId: input.paperId, deviceId: input.deviceId, reproductionId: input.reproductionId },
    "FastClaw deploy chat initiated (web stream)",
  );

  return fastclawClient.webChatStream(message, logger, {
    agentId: env.FASTCLAW_AGENT_DEPLOY,
    sessionKey: input.sessionKey ?? input.reproductionId,
  });
}

// ---------- Persistent FastClaw sessions ----------

type HistoryTurn = { role: "user" | "assistant"; content: string };

const SESSION_KEY_PREFIX = "wcp-fastclaw";

export async function createSession(
  input: CreateFastClawSessionInput,
): Promise<FastClawSessionDto> {
  const row = await repo.insertSession({
    entry: input.entry ?? null,
    initialContext: input.initialContext ?? {},
    agentRole: input.agentRole ?? null,
    agentId: input.agentId ?? null,
    userId: null,
  });
  return {
    sessionId: row.id,
    entry: row.entry,
    agentRole: row.agentRole,
    agentId: row.agentId,
    createdAt: row.createdAt,
  };
}

export async function getSessionOrThrow(sessionId: string) {
  const row = await repo.getSessionById(sessionId);
  if (!row) throw new NotFoundError("FastClawSession", sessionId);
  return row;
}

export async function getRunOrThrow(runId: string) {
  const row = await repo.getRunById(runId);
  if (!row) throw new NotFoundError("FastClawRun", runId);
  return row;
}

export function buildRunStreamUrl(runId: string): string {
  return `/api/fastclaw/runs/${runId}/stream`;
}

export async function sendPersistentMessage(
  sessionId: string,
  input: SendFastClawMessageInput,
  logger: Logger,
): Promise<FastClawRunResponseDto> {
  ensureConfigured();

  const session = await getSessionOrThrow(sessionId);
  const agentRole = session.agentRole ?? input.agentRole ?? null;
  const explicitAgentId = session.agentId ?? input.agentId ?? null;
  const agentId = explicitAgentId ?? resolveAgentId({ agentRole: agentRole ?? undefined }) ?? null;

  const context = {
    ...(input.context ?? {}),
    ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
  };

  const run = await repo.insertRun({
    sessionId,
    userId: null,
    userMessage: input.message,
    context,
    agentRole,
    agentId,
  });

  const runLogger = logger.child({ fastclawRunId: run.id, fastclawSessionId: sessionId });
  runLogger.info(
    { agentRole, agentId, messagePreview: input.message.slice(0, 160) },
    "FastClaw run accepted",
  );

  void runFastClawRun({
    runId: run.id,
    sessionId,
    runtimeMessage: input.message,
    logger: runLogger,
  });

  return {
    runId: run.id,
    status: "running",
    streamUrl: buildRunStreamUrl(run.id),
    message: run.userMessage,
  };
}

export async function startPersistentDeploy(
  sessionId: string,
  input: FastClawDeployInput,
  logger: Logger,
): Promise<FastClawRunResponseDto> {
  ensureConfigured();

  await getSessionOrThrow(sessionId);
  const built = await buildDeployMessage(input);
  const agentId = env.FASTCLAW_AGENT_DEPLOY ?? resolveAgentId({ agentRole: "deploy" }) ?? null;

  const run = await repo.insertRun({
    sessionId,
    userId: null,
    userMessage: built.displayMessage,
    context: {
      reproductionId: input.reproductionId,
      paperId: input.paperId,
      deviceId: input.deviceId,
      runtimeMessage: built.message,
    },
    agentRole: "deploy",
    agentId,
  });

  const runLogger = logger.child({ fastclawRunId: run.id, fastclawSessionId: sessionId });
  runLogger.info(
    { paperId: input.paperId, deviceId: input.deviceId, reproductionId: input.reproductionId },
    "FastClaw deploy run accepted",
  );

  void runFastClawRun({
    runId: run.id,
    sessionId,
    runtimeMessage: built.message,
    logger: runLogger,
  });

  return {
    runId: run.id,
    status: "running",
    streamUrl: buildRunStreamUrl(run.id),
    message: run.userMessage,
  };
}

type RunFastClawInput = {
  runId: string;
  sessionId: string;
  runtimeMessage: string;
  logger: Logger;
};

class FastClawDeltaAggregator {
  private buffer = "";
  private readonly maxChars = 1200;

  append(delta: string): CommandStreamEvent | null {
    if (!delta) return null;
    this.buffer += delta;
    if (this.buffer.length >= this.maxChars) return this.flush();
    return null;
  }

  flush(): CommandStreamEvent | null {
    if (!this.buffer) return null;
    const event: CommandStreamEvent = {
      type: "agent_message",
      message: this.buffer,
    };
    this.buffer = "";
    return event;
  }
}

async function runFastClawRun(input: RunFastClawInput): Promise<void> {
  const { runId, sessionId, runtimeMessage, logger } = input;
  const aggregator = new FastClawDeltaAggregator();
  let fullContent = "";
  let finalized = false;

  const flushDeltas = async (): Promise<void> => {
    const event = aggregator.flush();
    if (event) await appendAndBroadcast(runId, event);
  };

  try {
    const run = await getRunOrThrow(runId);
    await repo.updateRunStatus(runId, "running");
    const history = await buildConversationHistory(sessionId, runId, logger);
    const context = parseContext(run.contextJson);
    const systemPrompt =
      typeof context.systemPrompt === "string" ? context.systemPrompt : undefined;

    const chunks = await chatStream(
      {
        message: runtimeMessage,
        ...(history.length > 0 ? { history } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt } : {}),
        stream: true,
        sessionKey: `${SESSION_KEY_PREFIX}-${sessionId}`,
        ...(run.agentRole !== null ? { agentRole: run.agentRole } : {}),
        ...(run.agentId !== null ? { agentId: run.agentId } : {}),
      },
      logger,
    );

    for await (const chunk of chunks) {
      if (chunk.content) {
        fullContent += chunk.content;
        const event = aggregator.append(chunk.content);
        if (event) await appendAndBroadcast(runId, event);
      }
      if (chunk.finishReason) break;
    }

    await flushDeltas();
    if (!fullContent.trim()) {
      const emptyError: CommandStreamEvent = {
        type: "error",
        code: "FASTCLAW_EMPTY_RESPONSE",
        message: "FastClaw run completed but returned no assistant content.",
      };
      await appendAndBroadcast(runId, emptyError);
      await repo.finalizeRun(runId, {
        status: "failed",
        error: { code: emptyError.code, message: emptyError.message },
      });
      finalized = true;
      return;
    }

    const final: CommandStreamEvent = {
      type: "final",
      result: { status: "completed" },
    };
    await appendAndBroadcast(runId, final);
    await repo.finalizeRun(runId, {
      status: "completed",
      result: { output: fullContent },
    });
    finalized = true;
  } catch (err) {
    const mapped: CommandStreamEvent =
      err instanceof FastClawError
        ? { type: "error", code: err.code, message: err.message }
        : {
            type: "error",
            code: "FASTCLAW_RUN_FAILED",
            message: err instanceof Error ? err.message : "FastClaw run failed",
          };

    try {
      await flushDeltas();
      await appendAndBroadcast(runId, mapped);
      await repo.finalizeRun(runId, {
        status: "failed",
        error: {
          message: mapped.message,
          ...(mapped.code !== undefined ? { code: mapped.code } : {}),
        },
      });
      finalized = true;
    } catch (inner) {
      logger.error({ err: inner }, "Failed to persist FastClaw run failure");
    }

    logger.warn({ err, code: mapped.code }, "FastClaw run failed");
  } finally {
    fastclawRunEventBus.publishEnd(runId);
    if (!finalized) {
      logger.warn("FastClaw run exited without finalizing status");
    }
  }
}

async function buildConversationHistory(
  sessionId: string,
  excludeRunId: string,
  logger: Logger,
): Promise<HistoryTurn[]> {
  const rows = await repo.listRunsBySession(sessionId, excludeRunId);
  const history: HistoryTurn[] = [];
  for (const row of rows) {
    if (row.status !== "completed") continue;
    const assistantText = extractAssistantText(row.resultJson);
    if (!assistantText) continue;
    history.push({ role: "user", content: row.userMessage });
    history.push({ role: "assistant", content: assistantText });
  }
  if (history.length > 0) {
    logger.debug({ turns: history.length }, "Assembled FastClaw conversation history");
  }
  return history;
}

function extractAssistantText(resultJson: string | null): string | null {
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out = (parsed as { output?: unknown }).output;
      if (typeof out === "string" && out.trim().length > 0) return out;
    }
    if (typeof parsed === "string" && parsed.trim().length > 0) return parsed;
  } catch {
    return null;
  }
  return null;
}

function parseContext(contextJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(contextJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function appendAndBroadcast(
  runId: string,
  event: CommandStreamEvent,
): Promise<FastClawEventRowWithSeq> {
  const row = await repo.appendEvent(runId, event);
  fastclawRunEventBus.publishEvent(runId, row);
  return row;
}

export async function replayEvents(
  runId: string,
  lastEventId?: string,
): Promise<FastClawEventRowWithSeq[]> {
  if (!lastEventId) return repo.listEventsByRun(runId);
  const cursor = await repo.getEventById(lastEventId);
  if (!cursor || cursor.runId !== runId) {
    baseLogger.warn({ runId, lastEventId }, "Invalid FastClaw Last-Event-ID");
    return repo.listEventsByRun(runId);
  }
  return repo.listEventsAfter(runId, cursor.seq);
}

export function rowToStreamEvent(row: FastClawEventRowWithSeq): CommandStreamEvent | null {
  try {
    return JSON.parse(row.payloadJson) as CommandStreamEvent;
  } catch {
    return null;
  }
}

export async function listEvents(runId: string): Promise<CommandStreamEvent[]> {
  await getRunOrThrow(runId);
  const rows = await repo.listEventsByRun(runId);
  return rows.map(rowToStreamEvent).filter((event): event is CommandStreamEvent => event !== null);
}

export async function getSessionHistory(sessionId: string): Promise<FastClawSessionHistoryDto> {
  const session = await getSessionOrThrow(sessionId);
  const runRows = await repo.listRunsBySession(sessionId);

  const eventsByRun = new Map<string, CommandStreamEvent[]>();
  if (runRows.length > 0) {
    const eventRows = await repo.listEventsByRunIds(runRows.map((row) => row.id));
    for (const row of eventRows) {
      const event = rowToStreamEvent(row);
      if (!event) continue;
      const bucket = eventsByRun.get(row.runId);
      if (bucket) bucket.push(event);
      else eventsByRun.set(row.runId, [event]);
    }
  }

  return {
    sessionId: session.id,
    entry: session.entry,
    agentRole: session.agentRole,
    agentId: session.agentId,
    createdAt: session.createdAt,
    runs: runRows.map((row) => ({
      runId: row.id,
      userMessage: row.userMessage,
      status: row.status,
      agentRole: row.agentRole,
      agentId: row.agentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      events: eventsByRun.get(row.id) ?? [],
    })),
  };
}
