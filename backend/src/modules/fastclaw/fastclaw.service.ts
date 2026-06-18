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
  FastClawDeployInput,
  FastClawAnalyzeInput,
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
 * 流式对话。返回 AsyncIterable<FastClawStreamChunk>。
 * 路由层负责把它转成 SSE 推给前端。
 */
export async function chatStream(
  input: FastClawChatInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  if (input.agentRole === "deploy") {
    // 不要为缺失的 sessionKey 伪造时间戳 key——那样每轮请求都是不同的 key，
    // FastClaw 会每轮开新会话、丢上下文，比直接透传 undefined 还糟。
    // 多轮部署追问由前端缓存并回传稳定 sessionKey（见 use-fastclaw-deploy）。
    return fastclawClient.webChatStream(input.message, logger, {
      agentId: resolveAgentId(input),
      sessionKey: input.sessionKey,
    });
  }

  const messages = buildMessages(input);
  return fastclawClient.chatStream(messages, logger, {
    agentId: resolveAgentId(input),
    sessionKey: input.sessionKey,
  });
}

// ---------- Deploy：论文部署助手 ----------

/**
 * 构造部署模板消息。
 *
 * 把论文信息 + 设备信息 + SSH 连接说明拼成一条完整的部署指令。
 *
 * 注意：deploy 走 webChatStream，它只接受单个 message 字符串、没有 system 通道，
 * 所以连接说明必须并进 message 正文，不能依赖单独的 systemPrompt 字段。
 */
export async function buildDeployMessage(input: FastClawDeployInput): Promise<{
  message: string;
}> {
  // 获取论文信息
  const paper = await paperRepo.getPaperById(input.paperId);
  if (!paper) throw new NotFoundError("Paper", input.paperId);

  // 获取设备信息
  const device = await getDeviceOrThrow(input.deviceId);

  // 获取 host 凭证
  const cred = await hostRepo.getHostCredentialById(input.deviceId);
  if (!cred) throw new NotFoundError("HostCredential", input.deviceId);

  // SSH 采用密钥认证：keyFile 是目标机上的私钥路径（非机密），不涉及密码下发。
  const sshSection = cred.keyFile
    ? `## SSH 连接方式（密钥认证）
ssh -i ${cred.keyFile} -o StrictHostKeyChecking=no ${cred.username}@${cred.host} -p ${cred.port}

私钥已在目标机器上配置，直接用上面的命令连接，不需要密码。`
    : `## SSH 连接方式
⚠️ 该设备尚未配置 SSH 密钥（keyFile 为空），无法自动连接。
请先提示用户在设备管理里为 ${device.name} 配置 SSH 私钥路径（keyFile），再重新发起部署。`;

  const repoInfo = paper.repoUrl
    ? `\n- GitHub 仓库：${paper.repoUrl}`
    : "\n- GitHub 仓库：未提供（请搜索或询问用户）";

  let authors = "未知";
  try {
    const parsed = JSON.parse(paper.authorsJson);
    if (Array.isArray(parsed) && parsed.length > 0) authors = parsed.join(", ");
  } catch {
    // malformed authorsJson — use fallback
  }

  const message = `你是一个论文代码部署助手。请帮我把论文《${paper.title}》的代码部署到指定 GPU 服务器并启动训练。

## 目标设备
- 名称：${device.name}
- IP：${cred.host}
- 用户：${cred.username}
- SSH 端口：${cred.port}

${sshSection}

## 论文信息
- 标题：${paper.title}${repoInfo}
- 作者：${authors}

## 工作流程
1. SSH 连接到目标设备
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

  return { message };
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

  // 与前端同款稳定 sessionKey（fronted 按 `wcp-deploy-${reproductionId}` 派生），
  // 让同一条复现记录的多次部署/追问归并到同一会话窗口。
  return fastclawClient.webChatStream(message, logger, {
    agentId: env.FASTCLAW_AGENT_DEPLOY,
    sessionKey: input.sessionKey ?? `wcp-deploy-${input.reproductionId}`,
  });
}

// ---------- Analyse：论文分析助手 ----------

/**
 * 构造论文分析指令。把标题 + 作者 + 摘要拼成一条让 analyse agent 做结构化解读的消息。
 *
 * 注意：analyse 走 webChatStream（同 deploy），单 message 字符串、无 system 通道，
 * 所以分析要求必须并进 message 正文。
 */
function buildAnalyzeMessage(paper: {
  title: string;
  authorsJson: string;
  abstract: string | null;
}): string {
  let authors = "未知";
  try {
    const parsed = JSON.parse(paper.authorsJson);
    if (Array.isArray(parsed) && parsed.length > 0) authors = parsed.join(", ");
  } catch {
    // malformed authorsJson — use fallback
  }

  const abstractSection = paper.abstract?.trim()
    ? `\n\n## 摘要\n${paper.abstract.trim()}`
    : "\n\n## 摘要\n（未提供摘要，请基于标题与你掌握的资料分析，并说明信息有限。）";

  return `你是一个论文分析助手。请阅读下面这篇论文并给出结构化解读。

## 论文信息
- 标题：${paper.title}
- 作者：${authors}${abstractSection}

## 分析要求
请依次输出以下部分（用 Markdown 小标题分隔）：
1. 任务定义：论文要解决的核心问题
2. 研究问题：拆解出的关键研究问题
3. 方法概述：核心方法 / 模型 / 思路
4. 评估指标与结果：用了哪些指标、主要结果
5. 结论与启示
6. 阅读笔记：值得注意的细节或局限

如需查阅资料可调用工具；每一步分析尽量简洁、抓重点。`;
}

/**
 * 发起论文分析对话（FastClaw Web Chat 事件流）。
 *
 * 与 deploy 同构：走 /api/chat/stream 而非 OpenAI 兼容接口，这样工具调用过程
 * （tool_call / tool_result / subagent_progress）能稳定暴露给前端做实时可视化。
 */
export async function analyzeChatStream(
  input: FastClawAnalyzeInput,
  logger: Logger,
): Promise<AsyncIterable<FastClawStreamChunk>> {
  ensureConfigured();

  const paper = await paperRepo.getPaperById(input.paperId);
  if (!paper) throw new NotFoundError("Paper", input.paperId);

  const message = buildAnalyzeMessage(paper);

  logger.info({ paperId: input.paperId }, "FastClaw analyze chat initiated (web stream)");

  // 按 paperId 派生稳定 sessionKey，让同一篇论文的多次分析归并到同一会话窗口。
  return fastclawClient.webChatStream(message, logger, {
    agentId: env.FASTCLAW_AGENT_PAPER_ANALYSE,
    sessionKey: input.sessionKey ?? `wcp-analyse-${input.paperId}`,
  });
}
