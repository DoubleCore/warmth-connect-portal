import { apiFetch, apiUrl } from "@/lib/api-client";
import type {
  FastClawAgentRole,
  FastClawRunResponseDto,
  FastClawSessionDto,
  FastClawSessionHistoryDto,
} from "@/types/fastclaw";

export async function createFastClawSession(input?: {
  entry?: string;
  initialContext?: Record<string, unknown>;
  agentRole?: FastClawAgentRole;
  agentId?: string;
}): Promise<FastClawSessionDto> {
  return apiFetch<FastClawSessionDto>("/api/fastclaw/sessions", {
    method: "POST",
    json: {
      entry: input?.entry,
      initialContext: input?.initialContext ?? {},
      agentRole: input?.agentRole,
      agentId: input?.agentId,
    },
  });
}

export async function getFastClawSessionHistory(
  sessionId: string,
): Promise<FastClawSessionHistoryDto> {
  return apiFetch<FastClawSessionHistoryDto>(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/history`,
  );
}

export async function sendFastClawMessage(
  sessionId: string,
  input: {
    message: string;
    context?: Record<string, unknown>;
    systemPrompt?: string;
    agentRole?: FastClawAgentRole;
    agentId?: string;
  },
): Promise<FastClawRunResponseDto> {
  return apiFetch<FastClawRunResponseDto>(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: "POST",
      json: {
        message: input.message,
        context: input.context ?? {},
        systemPrompt: input.systemPrompt,
        agentRole: input.agentRole,
        agentId: input.agentId,
      },
    },
  );
}

export async function startFastClawDeploy(
  sessionId: string,
  input: {
    reproductionId: string;
    paperId: string;
    deviceId: string;
  },
): Promise<FastClawRunResponseDto> {
  return apiFetch<FastClawRunResponseDto>(
    `/api/fastclaw/sessions/${encodeURIComponent(sessionId)}/deploy`,
    {
      method: "POST",
      json: input,
    },
  );
}

export function openFastClawRunStream(runId: string): EventSource {
  return new EventSource(apiUrl(`/api/fastclaw/runs/${encodeURIComponent(runId)}/stream`), {
    withCredentials: false,
  });
}
