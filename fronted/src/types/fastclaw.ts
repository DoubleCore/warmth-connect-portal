import type { CommandStreamEvent } from "@/types/command";

export type FastClawAgentRole = "deploy" | "analyse" | "researcher" | "reader" | "search";

export type FastClawRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type FastClawSessionDto = {
  sessionId: string;
  entry: string | null;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
};

export type FastClawRunResponseDto = {
  runId: string;
  status: FastClawRunStatus;
  streamUrl: string | null;
  message?: string;
  result?: unknown;
  error?: {
    code?: string;
    message: string;
  };
};

export type FastClawHistoryRunDto = {
  runId: string;
  userMessage: string;
  status: FastClawRunStatus;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
  events: CommandStreamEvent[];
};

export type FastClawSessionHistoryDto = {
  sessionId: string;
  entry: string | null;
  agentRole: FastClawAgentRole | null;
  agentId: string | null;
  createdAt: string;
  runs: FastClawHistoryRunDto[];
};
