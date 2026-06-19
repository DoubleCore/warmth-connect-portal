import { AppError } from "@/shared/errors.js";
import type { LlmConfigDto, UpdateLlmConfigInput } from "./llm-config.dto.js";
import * as repo from "./llm-config.repository.js";

export function getConfig(): LlmConfigDto {
  return repo.readConfig();
}

/**
 * 写用户自定义 API/模型。写库成功后返回 needsRestart=true：
 * FastClaw 启动时把 configs 读进内存，改 db 后需重启子进程才生效，
 * 由前端经 Electron IPC 触发重启。
 */
export function updateConfig(input: UpdateLlmConfigInput): {
  config: LlmConfigDto;
  needsRestart: boolean;
} {
  try {
    repo.writeConfig(input);
  } catch (err) {
    if (err instanceof repo.FastclawDbUnavailableError) {
      throw new AppError(err.message, 503, "FASTCLAW_DB_UNAVAILABLE");
    }
    throw err;
  }
  return { config: repo.readConfig(), needsRestart: true };
}
