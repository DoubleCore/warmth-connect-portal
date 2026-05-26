import { apiFetch } from "@/lib/api-client";
import type { Agent, TestAgentResult, UpdateAgentInput } from "@/types/agent";

export async function listAgents() {
  return apiFetch<Agent[]>("/api/agents");
}

export async function getAgent(id: string) {
  return apiFetch<Agent>(`/api/agents/${encodeURIComponent(id)}`);
}

export async function updateAgent(id: string, input: UpdateAgentInput) {
  return apiFetch<Agent>(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    json: input,
  });
}

export async function testAgent(id: string, message?: string) {
  return apiFetch<TestAgentResult>(`/api/agents/${encodeURIComponent(id)}/test`, {
    method: "POST",
    json: message ? { message } : {},
  });
}
