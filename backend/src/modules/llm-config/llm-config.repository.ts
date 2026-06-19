import { existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { env } from "@/config/env.js";
import type { ApiType, LlmConfigDto, UpdateLlmConfigInput } from "./llm-config.dto.js";

/**
 * 直接读写 FastClaw 的 `fastclaw.db`（独立于本应用的 SQLite，所以不用共享的
 * drizzle `db`，而是按 FASTCLAW_HOME 现开一个 better-sqlite3 连接）。
 *
 * FastClaw 的 `configs` 表（明文存储，已实测）：
 *   - provider 行： kind='provider', scope='system', name='anthropic'
 *       data = {"apiBase","apiKey","apiType","authType","models":[...]}
 *   - 模型行：     kind='setting', scope='agent', name='agents.defaults', agent_id=<id>
 *       data = {"model":"<provider>/<modelId>"}（每个 agent 一条）
 *
 * 注意：这耦合了 FastClaw 的内部表结构，FastClaw 升级可能 break（已知风险）。
 */

const PROVIDER_NAME = "anthropic";

// research/deploy/analyse 三个 agent 的 model 行都要同步更新。
const AGENT_IDS = [
  "agt_f908ad32af3120090a37", // researcher
  "agt_18b2eb56cb44f511848e", // paperanalyse
  "agt_44d05b7677054cebfdad", // deploy
];

export class FastclawDbUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FastclawDbUnavailableError";
  }
}

function dbPath(): string | null {
  if (!env.FASTCLAW_HOME) return null;
  const p = join(env.FASTCLAW_HOME, "fastclaw.db");
  return existsSync(p) ? p : null;
}

function openDb(): Database.Database {
  const p = dbPath();
  if (!p) {
    throw new FastclawDbUnavailableError(
      "FastClaw 数据库不可用（FASTCLAW_HOME 未配置或 fastclaw.db 不存在）。",
    );
  }
  const db = new Database(p);
  // The FastClaw gateway process holds this same WAL db open. Wait up to 5s on a
  // write lock instead of failing immediately with SQLITE_BUSY.
  db.pragma("busy_timeout = 5000");
  return db;
}

function maskKey(key: string | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

type ProviderData = {
  apiBase?: string;
  apiKey?: string;
  apiType?: string;
  authType?: string;
  models?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

/** 读 provider 行 + researcher 的 model，组装成脱敏的 DTO。 */
export function readConfig(): LlmConfigDto {
  const empty: LlmConfigDto = {
    configured: false,
    apiBase: null,
    apiKeyMasked: null,
    apiType: null,
    model: null,
  };
  if (!dbPath()) return empty;

  const db = openDb();
  try {
    const provider = db
      .prepare("SELECT data FROM configs WHERE kind='provider' AND name=? LIMIT 1")
      .get(PROVIDER_NAME) as { data?: string } | undefined;
    if (!provider?.data) return empty;

    let pdata: ProviderData;
    try {
      pdata = JSON.parse(provider.data) as ProviderData;
    } catch {
      return empty;
    }

    // model 行：取 researcher 这条；data.model 形如 "anthropic/claude-opus-4-7"
    const modelRow = db
      .prepare(
        "SELECT data FROM configs WHERE kind='setting' AND name='agents.defaults' AND agent_id=? LIMIT 1",
      )
      .get(AGENT_IDS[0]) as { data?: string } | undefined;
    let modelId: string | null = null;
    if (modelRow?.data) {
      try {
        const m = JSON.parse(modelRow.data) as { model?: string };
        if (typeof m.model === "string") {
          const slash = m.model.indexOf("/");
          modelId = slash >= 0 ? m.model.slice(slash + 1) : m.model;
        }
      } catch {
        /* ignore */
      }
    }

    const apiType: ApiType | null =
      pdata.apiType === "openai" || pdata.apiType === "anthropic-messages" ? pdata.apiType : null;

    return {
      configured: Boolean(pdata.apiKey),
      apiBase: typeof pdata.apiBase === "string" ? pdata.apiBase : null,
      apiKeyMasked: maskKey(pdata.apiKey),
      apiType,
      model: modelId,
    };
  } finally {
    db.close();
  }
}

/**
 * 写 provider 行 + 三个 agent 的 model 行，事务原子提交。
 * authType 固定 "api-key"；models[] 至少包含用户填的这个 model。
 */
export function writeConfig(input: UpdateLlmConfigInput): void {
  const db = openDb();
  try {
    const tx = db.transaction(() => {
      const providerRow = db
        .prepare("SELECT data FROM configs WHERE kind='provider' AND name=? LIMIT 1")
        .get(PROVIDER_NAME) as { data?: string } | undefined;

      let pdata: ProviderData = {};
      if (providerRow?.data) {
        try {
          pdata = JSON.parse(providerRow.data) as ProviderData;
        } catch {
          pdata = {};
        }
      }

      pdata.apiBase = input.apiBase;
      // apiKey 为空字符串 → 保留原有 key（“不修改”语义）。
      if (input.apiKey.length > 0) pdata.apiKey = input.apiKey;
      pdata.apiType = input.apiType;
      pdata.authType = "api-key";

      // 确保 models[] 含用户填的 model（用最小可用结构）。
      const models = Array.isArray(pdata.models) ? pdata.models : [];
      const hasModel = models.some((m) => (m as { id?: string }).id === input.model);
      if (!hasModel) {
        models.push({
          id: input.model,
          name: input.model,
          contextWindow: 200000,
          maxTokens: 8192,
          input: ["text"],
          reasoning: false,
          cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        });
      }
      pdata.models = models;

      const nowIso = new Date().toISOString().replace("T", " ").replace("Z", " +0000 UTC");
      const newProviderData = JSON.stringify(pdata);

      const upd = db.prepare(
        "UPDATE configs SET data=?, updated_at=? WHERE kind='provider' AND name=?",
      );
      const res = upd.run(newProviderData, nowIso, PROVIDER_NAME);
      if (res.changes === 0) {
        throw new FastclawDbUnavailableError(
          "FastClaw provider 配置行不存在，无法写入（请确认 FastClaw 已初始化）。",
        );
      }

      // 每个 agent 的 model 行：data.model = "<provider>/<modelId>"
      const fullModel = `${PROVIDER_NAME}/${input.model}`;
      const updModel = db.prepare(
        "UPDATE configs SET data=?, updated_at=? WHERE kind='setting' AND name='agents.defaults' AND agent_id=?",
      );
      let agentRowsUpdated = 0;
      for (const agentId of AGENT_IDS) {
        agentRowsUpdated += updModel.run(JSON.stringify({ model: fullModel }), nowIso, agentId).changes;
      }
      // If none matched, the seeded db's agent ids differ from our hardcoded list
      // (e.g. FastClaw was re-seeded with new agents). Without this guard the save
      // would look successful while the agents silently keep their old model.
      if (agentRowsUpdated === 0) {
        throw new FastclawDbUnavailableError(
          "未能更新任何 Agent 的模型配置（Agent ID 与预期不符，可能 FastClaw 已重置）。",
        );
      }
    });
    tx();
  } finally {
    db.close();
  }
}
