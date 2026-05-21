import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { getDeviceOrThrow } from "@/modules/devices/devices.service.js";
import * as hostRepo from "@/modules/host-tracking/host-tracking.repository.js";
import * as paperRepo from "@/modules/papers/papers.repository.js";
import { NotFoundError } from "@/shared/errors.js";
import {
  fastclawClient,
  type FastClawMessage,
  type FastClawStreamChunk,
} from "./fastclaw.client.js";
import { FastClawError } from "./fastclaw.client.js";
import type {
  FastClawChatInput,
  FastClawChatResponseDto,
  FastClawDeployInput,
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
function resolveAgentId(input: FastClawChatInput): string | undefined {
  if (input.agentId) return input.agentId;
  switch (input.agentRole) {
    case "deploy":
      return env.FASTCLAW_AGENT_DEPLOY ?? undefined;
    case "analyse":
      return env.FASTCLAW_AGENT_PAPER_ANALYSE ?? undefined;
    case "researcher":
      return env.FASTCLAW_AGENT_RESEARCHER ?? undefined;
    default:
      return undefined;
  }
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
}> {
  // 获取论文信息
  const paper = await paperRepo.getPaperById(input.paperId);
  if (!paper) throw new NotFoundError("Paper", input.paperId);

  // 获取设备信息
  const device = await getDeviceOrThrow(input.deviceId);

  // 获取 host 凭证
  const cred = await hostRepo.getHostCredentialById(input.deviceId);
  if (!cred) throw new NotFoundError("HostCredential", input.deviceId);

  const systemPrompt = `你是一个论文代码部署助手。你的任务是帮助用户将论文的代码部署到指定的 GPU 服务器上。

## SSH 连接信息获取方式
通过后端 API 查询目标设备的 SSH 凭证（含明文密码）：
GET http://localhost:8787/api/host-tracking/hosts/${input.deviceId}

返回的 JSON 里包含：host、port、username、password 字段。
用 sshpass -p '<password>' ssh -o StrictHostKeyChecking=no <username>@<host> 连接。

## 目标设备
- 名称：${device.name}
- IP：${cred.host}
- 用户：${cred.username}
- 密码：${cred.encryptedPassword ?? "(未设置，请查询 API)"}
- SSH 端口：${cred.port}

## 工作流程
1. 用密码 SSH 连接到目标设备（sshpass 方式，不要用密钥）
2. 确认 GPU 环境（nvidia-smi）
3. 克隆论文代码仓库到 ~/LHL/ 目录
4. 创建虚拟环境并安装依赖
5. 根据 README 配置训练参数
6. 启动训练（用 nohup 或 tmux 后台运行）
7. 报告部署结果

## 注意
- 一律使用密码登录，不要尝试 SSH 密钥
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

请按以下步骤执行：
1. SSH 连接到目标设备
2. 克隆代码仓库到合适的目录
3. 创建虚拟环境并安装依赖
4. 配置训练参数
5. 启动训练任务

如果遇到问题请告诉我。`;

  return { message, systemPrompt };
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
 * 发起部署对话（真流式）。
 *
 * 部署 agent 会执行 SSH / clone / install / launch 等长耗时动作，非流式等待完整
 * completion 会被 FASTCLAW_TIMEOUT_MS 截断。这里直接返回 FastClaw streaming chunk，
 * 由路由层桥接成前端 SSE。
 */
export async function deployChatStream(
  input: FastClawDeployInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  const { message, systemPrompt } = await buildDeployMessage(input);
  const messages = buildMessages({
    message,
    systemPrompt,
    stream: true,
  });

  logger.info(
    { paperId: input.paperId, deviceId: input.deviceId, reproductionId: input.reproductionId },
    "FastClaw deploy chat initiated (streaming)",
  );

  return fastclawClient.chatStream(messages, logger, {
    agentId: env.FASTCLAW_AGENT_DEPLOY,
    sessionKey: input.sessionKey,
  });
}
