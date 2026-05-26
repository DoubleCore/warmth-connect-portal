import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { env } from "@/config/env.js";
import { AppError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";

import { agentFileSchema, type AgentFile } from "./agents.types.js";

/**
 * File-based repository for per-agent configuration.
 *
 * 路径布局：
 *   <AGENTS_DIR>/<agent-id>/agent.json
 *
 * 写入策略：
 *   - 写到临时文件再 rename，保证读到的总是 well-formed JSON
 *     （Windows 上 fs.rename 在覆盖目标存在时会抛 EEXIST，所以走 writeFile + rename
 *      到同一目录的 .tmp 后再用 fs.rename，而非 fs.copyFile）
 */

const log = baseLogger.child({ module: "agents.repository" });

function agentDir(agentId: string): string {
  return resolve(env.AGENTS_DIR, agentId);
}

function agentFilePath(agentId: string): string {
  return join(agentDir(agentId), "agent.json");
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * 读取 agent.json；文件不存在时返回 null（让上层决定是不是要补种子）。
 */
export async function readAgent(agentId: string): Promise<AgentFile | null> {
  const file = agentFilePath(agentId);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AppError(
      `Failed to read agent file: ${(err as Error).message}`,
      500,
      "AGENT_FILE_READ_FAILED",
      { agentId, file },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.error({ err, file }, "agent.json is not valid JSON");
    throw new AppError(
      `agent.json for ${agentId} is not valid JSON`,
      500,
      "AGENT_FILE_CORRUPT",
      { agentId, file },
    );
  }

  const result = agentFileSchema.safeParse(parsed);
  if (!result.success) {
    log.error(
      { issues: result.error.flatten(), file },
      "agent.json failed schema validation",
    );
    throw new AppError(
      `agent.json for ${agentId} failed schema validation`,
      500,
      "AGENT_FILE_INVALID",
      { agentId, issues: result.error.flatten() },
    );
  }
  return result.data;
}

/**
 * 落盘。会调 schema.parse 兜底；调用方传进来的 partial 状态请先在 service 层合并好。
 *
 * 同步语义：
 *   1. 写到 `<file>.tmp`
 *   2. fs.rename 覆盖（atomic on POSIX；Windows 11 也支持原子 replace）
 *   3. 失败抛 AppError，并尝试清理 tmp
 */
export async function writeAgent(agent: AgentFile): Promise<AgentFile> {
  const validated = agentFileSchema.parse(agent);
  const dir = agentDir(validated.id);
  const file = agentFilePath(validated.id);
  const tmp = `${file}.tmp`;

  await ensureDir(dir);
  // 顺手把约定的子目录建好，方便 fastclaw 后续写入。
  await Promise.all([
    ensureDir(join(dir, "skills")),
    ensureDir(join(dir, "memory")),
    ensureDir(join(dir, "conversations")),
  ]);

  const json = `${JSON.stringify(validated, null, 2)}\n`;
  try {
    await writeFile(tmp, json, "utf8");
    // node:fs.promises 的 rename 在 Windows 上会覆盖已存在文件（自 Node 18+）。
    const { rename, unlink } = await import("node:fs/promises");
    try {
      await rename(tmp, file);
    } catch (err) {
      // 兜底：如果 rename 失败（极少数权限场景），尝试清理 tmp 再向上抛。
      try {
        await unlink(tmp);
      } catch {
        // ignore
      }
      throw err;
    }
  } catch (err) {
    throw new AppError(
      `Failed to write agent file: ${(err as Error).message}`,
      500,
      "AGENT_FILE_WRITE_FAILED",
      { agentId: validated.id, file },
    );
  }

  return validated;
}

/**
 * 检查 agent.json 是否存在，并返回最后修改时间（ISO 字符串）。
 * 不存在或读不到都返回 null —— 调用方拿来填 DTO 的 `updatedAt`，
 * 若为 null 就用 epoch 兜底。
 */
export async function getAgentMtime(agentId: string): Promise<string | null> {
  try {
    const stats = await stat(agentFilePath(agentId));
    return new Date(stats.mtimeMs).toISOString();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** 暴露目录解析给 fastclaw render — fastclaw 需要每个 agent 的 home/workspace。 */
export const agentPaths = {
  home: (agentId: string) => agentDir(agentId),
  workspace: (agentId: string) => resolve(env.AGENTS_DIR, "..", "workspaces", agentId),
};

/** 仅供启动期使用，确保 AGENTS_DIR 本身存在。 */
export async function ensureAgentsRoot(): Promise<void> {
  await ensureDir(resolve(env.AGENTS_DIR));
  await ensureDir(dirname(resolve(env.FASTCLAW_CONFIG_PATH)));
}
