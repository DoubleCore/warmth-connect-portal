import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { env } from "@/config/env.js";
import { AppError, NotFoundError } from "@/shared/errors.js";
import { decryptSecret, encryptSecret, isCryptoConfigured } from "@/shared/crypto.js";
import { baseLogger } from "@/shared/logger.js";

import type {
  AgentDto,
  TestAgentInput,
  TestAgentResult,
  UpdateAgentInput,
} from "./agents.dto.js";
import {
  agentPaths,
  ensureAgentsRoot,
  getAgentMtime,
  readAgent,
  writeAgent,
} from "./agents.repository.js";
import { agentFileSchema, SEED_AGENTS, type AgentFile } from "./agents.types.js";

const log = baseLogger.child({ module: "agents.service" });

/** 转换 AgentFile（含密文）→ AgentDto（脱敏）。 */
function toDto(file: AgentFile, updatedAt: string | null): AgentDto {
  return {
    id: file.id,
    role: file.role,
    displayName: file.displayName,
    model: file.model,
    temperature: file.temperature,
    maxTokens: file.maxTokens,
    maxToolIterations: file.maxToolIterations,
    provider: {
      kind: file.provider.kind,
      apiBase: file.provider.apiBase,
      apiKeyConfigured: Boolean(file.provider.apiKeyEnc),
    },
    updatedAt: updatedAt ?? new Date(0).toISOString(),
  };
}

/**
 * 读取一个 agent；如果文件不存在但属于 SEED_AGENTS，自动用种子 + 后端默认值生成一份。
 * 这个回退路径让"装包安装后第一次访问 settings 页"也能拿到完整列表，无需手动初始化。
 */
async function ensureAgentExists(agentId: string): Promise<AgentFile> {
  const existing = await readAgent(agentId);
  if (existing) return existing;

  const seed = SEED_AGENTS.find((s) => s.id === agentId);
  if (!seed) throw new NotFoundError("agent", agentId);

  const created = agentFileSchema.parse({
    id: seed.id,
    role: seed.role,
    displayName: seed.displayName,
    model: "openai/gpt-4o-mini",
    temperature: seed.temperature,
    maxTokens: seed.maxTokens,
    maxToolIterations: seed.maxToolIterations,
    provider: {
      kind: "openai",
      apiBase: "https://api.openai.com/v1",
    },
  });
  await writeAgent(created);
  log.info({ agentId }, "Initialized agent.json from seed");
  return created;
}

/**
 * 启动期初始化：保证 AGENTS_DIR 存在，所有种子 agent 都有 agent.json，
 * 然后渲染一份 fastclaw.json。
 *
 * 注意：用户已经手动改过的 agent.json 不会被覆盖（只补缺失文件）。
 */
export async function bootstrapAgents(): Promise<void> {
  await ensureAgentsRoot();
  for (const seed of SEED_AGENTS) {
    try {
      await ensureAgentExists(seed.id);
    } catch (err) {
      log.error({ err, seedId: seed.id }, "Failed to bootstrap seed agent");
    }
  }
  try {
    await renderFastclawConfig();
  } catch (err) {
    // 渲染失败不应阻塞 backend 启动，只记日志。FastClaw 进程自己也能用旧文件继续跑。
    log.error({ err }, "Failed to render fastclaw config; continuing without refresh");
  }
}

/** 列出全部 agent。顺序按 SEED_AGENTS 固定，未在种子里的 agent 排在末尾。 */
export async function listAgents(): Promise<AgentDto[]> {
  const seedIds = new Set(SEED_AGENTS.map((s) => s.id));
  const result: AgentDto[] = [];

  // 1) 先按种子顺序输出
  for (const seed of SEED_AGENTS) {
    const file = await ensureAgentExists(seed.id);
    const mtime = await getAgentMtime(seed.id);
    result.push(toDto(file, mtime));
  }

  // 2) 用户自己加的 agent（不在种子里）。当前不支持，但保留扩展位。
  // file-based 实现下"扫目录列已存在 agent"很便宜，但会引入 readdir 噪声，
  // 等真有需求再加。Suppress eslint about unused.
  void seedIds;

  return result;
}

export async function getAgent(agentId: string): Promise<AgentDto> {
  const file = await ensureAgentExists(agentId);
  const mtime = await getAgentMtime(agentId);
  return toDto(file, mtime);
}

/**
 * 部分更新一个 agent。`provider.apiKey` 字段语义：
 *   - 不传        → 保留原密文
 *   - 显式空串 "" → 清空 apiKeyEnc
 *   - 非空字符串  → 加密后写入 apiKeyEnc
 */
export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<AgentDto> {
  const current = await ensureAgentExists(agentId);

  // 构造下一份 file。Object spread 顺序很关键：先铺旧值再覆盖新值。
  const nextProvider = { ...current.provider };
  if (input.provider) {
    if (input.provider.kind !== undefined) nextProvider.kind = input.provider.kind;
    if (input.provider.apiBase !== undefined) nextProvider.apiBase = input.provider.apiBase;
    if (input.provider.apiKey !== undefined) {
      const newKey = input.provider.apiKey;
      if (newKey === "") {
        nextProvider.apiKeyEnc = undefined;
      } else {
        if (!isCryptoConfigured()) {
          throw new AppError(
            "HOST_CRED_KEY 未配置，无法加密 API Key。请在 backend/.env 中设置该值。",
            503,
            "HOST_CRED_KEY_MISSING",
          );
        }
        nextProvider.apiKeyEnc = encryptSecret(newKey);
      }
    }
  }

  const nextFile: AgentFile = {
    ...current,
    displayName: input.displayName ?? current.displayName,
    model: input.model ?? current.model,
    temperature: input.temperature ?? current.temperature,
    maxTokens: input.maxTokens ?? current.maxTokens,
    maxToolIterations: input.maxToolIterations ?? current.maxToolIterations,
    provider: nextProvider,
  };

  const written = await writeAgent(nextFile);

  // 任何修改都触发 fastclaw 配置重渲染。
  try {
    await renderFastclawConfig();
  } catch (err) {
    log.error({ err, agentId }, "renderFastclawConfig after update failed");
  }

  // 装包模式下，让 launcher 重启 fastclaw 子进程，让新配置立刻生效。
  // 异步 fire-and-forget — 重启失败不应阻塞用户的"保存成功"反馈。dev 模式下
  // HERMES_LAUNCHER_CONTROL_URL 为空，函数立即 noop。
  notifyLauncherRestartFastclaw().catch((err) =>
    log.warn({ err, agentId }, "notify launcher restart failed (non-fatal)"),
  );

  const mtime = await getAgentMtime(agentId);
  return toDto(written, mtime);
}

/**
 * 拉一次 provider 做 echo 测试，验证 API Key / model 是否可用。
 * 直接打 chat completions，因为 fastclaw 内核也是这么打的。
 *
 * 不复用 fastclaw client：测试目标是 *provider*，不是 fastclaw 进程；
 * 不让网络拓扑掩盖配置错误。
 */
export async function testAgent(
  agentId: string,
  input: TestAgentInput,
): Promise<TestAgentResult> {
  const current = await ensureAgentExists(agentId);
  const message = input.message?.trim() || "Reply with the single word OK.";

  if (!current.provider.apiKeyEnc) {
    return {
      ok: false,
      error: "API Key 未配置，请先在设置页填入。",
      durationMs: 0,
    };
  }
  if (!isCryptoConfigured()) {
    return {
      ok: false,
      error: "HOST_CRED_KEY 未配置，无法解密已保存的 API Key。",
      durationMs: 0,
    };
  }

  let apiKey: string;
  try {
    apiKey = decryptSecret(current.provider.apiKeyEnc);
  } catch (err) {
    return {
      ok: false,
      error: `解密 API Key 失败：${(err as Error).message}`,
      durationMs: 0,
    };
  }

  // 解析 model 字段：fastclaw 配置里的格式是 "openai/gpt-4o-mini"，
  // OpenAI 兼容 API 实际只接受 "gpt-4o-mini"。如果以 provider 前缀开头就剥掉。
  const apiModel = stripProviderPrefix(current.model, current.provider.kind);
  const url = joinUrl(current.provider.apiBase, "/chat/completions");

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: apiModel,
        messages: [{ role: "user", content: message }],
        max_tokens: 32,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Provider 返回 HTTP ${res.status}：${body.slice(0, 200) || "no body"}`,
        durationMs: Date.now() - start,
      };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "";
    return {
      ok: reply.length > 0,
      reply: reply.slice(0, 500),
      error: reply.length === 0 ? "Provider 返回空内容。" : undefined,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: "请求超时（15s）。", durationMs: Date.now() - start };
    }
    return {
      ok: false,
      error: `请求失败：${(err as Error).message}`,
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把当前所有 agent 渲染成 FastClaw 兼容的 hermes-agents.json。
 * 这是后端和 fastclaw 之间的"配置接口"——fastclaw 进程启动时读取它。
 *
 * 关键点：
 *   - apiKey 在这里 *解密* 并以明文写入 fastclaw.json。这是必要的：fastclaw 是
 *     另一个进程，没法共享 backend 的内存中密钥。文件本身在 data/config/ 下，
 *     依赖 OS 文件权限保护（安装包默认装到用户目录而非全局只读位置）。
 *   - 多个 agent 公用同一个 provider key 时，写一份 providers + 各 agent 共享是更紧凑的，
 *     但当前实现是每个 agent 一份独立 provider，避免"改了 A 但 B 没跟上"的混乱。
 */
export async function renderFastclawConfig(): Promise<void> {
  const agents: Array<Record<string, unknown>> = [];

  for (const seed of SEED_AGENTS) {
    const file = await ensureAgentExists(seed.id);
    let apiKey: string | null = null;
    if (file.provider.apiKeyEnc && isCryptoConfigured()) {
      try {
        apiKey = decryptSecret(file.provider.apiKeyEnc);
      } catch (err) {
        log.warn({ err, agentId: file.id }, "decrypt apiKey failed; agent will be skipped");
      }
    }

    agents.push({
      id: file.id,
      role: file.role,
      name: file.displayName,
      model: file.model,
      maxTokens: file.maxTokens,
      temperature: file.temperature,
      maxToolIterations: file.maxToolIterations,
      home: agentPaths.home(file.id),
      workspace: agentPaths.workspace(file.id),
      providers: {
        [file.provider.kind]: {
          // fastclaw 不接受空 apiKey 字段；缺省时干脆不写出 key
          ...(apiKey ? { apiKey } : {}),
          apiBase: file.provider.apiBase,
        },
      },
    });
  }

  const defaultAgentId =
    env.FASTCLAW_DEFAULT_AGENT_ID ??
    env.FASTCLAW_AGENT_ID ??
    SEED_AGENTS[0]?.id ??
    "default";

  const payload = {
    defaultAgentId,
    agents,
  };

  const path = resolve(env.FASTCLAW_CONFIG_PATH);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  log.info({ path, agentCount: agents.length }, "Rendered fastclaw config");
}

function stripProviderPrefix(model: string, providerKind: string): string {
  const prefix = `${providerKind}/`;
  return model.toLowerCase().startsWith(prefix) ? model.slice(prefix.length) : model;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * 通知 Hermes 启动器重启 fastclaw 子进程。
 *
 * 仅当 `HERMES_LAUNCHER_CONTROL_URL` 设置（即 backend 由 Hermes.exe 启动器拉起）时
 * 生效；dev / 测试场景下函数立即返回。失败 silently log + return —— 调用方
 * （updateAgent / testAgent / 后续可能的批量保存）只关心配置已落盘，重启是 nice-to-have。
 */
async function notifyLauncherRestartFastclaw(): Promise<void> {
  const base = env.HERMES_LAUNCHER_CONTROL_URL;
  if (!base) return;

  const url = joinUrl(base, "/control/fastclaw/restart");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn(
        { status: res.status, body: body.slice(0, 200) },
        "launcher restart returned non-2xx",
      );
    }
  } catch (err) {
    log.warn({ err, url }, "launcher restart request failed");
  } finally {
    clearTimeout(timer);
  }
}
