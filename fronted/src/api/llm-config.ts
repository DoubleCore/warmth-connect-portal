import { apiFetch } from "@/lib/api-client";
import type { LlmConfig, UpdateLlmConfigInput, UpdateLlmConfigResult } from "@/types/llm-config";

export async function getLlmConfig() {
  return apiFetch<LlmConfig>("/api/llm-config");
}

export async function updateLlmConfig(input: UpdateLlmConfigInput) {
  return apiFetch<UpdateLlmConfigResult>("/api/llm-config", {
    method: "PUT",
    json: input,
  });
}
