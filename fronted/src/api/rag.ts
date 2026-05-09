import { apiFetch } from "@/lib/api-client";
import type { RagConversation, RagMessage, SendMessageResponse } from "@/types/rag";

export async function listConversations(paperId: string) {
  return apiFetch<{ items: RagConversation[] }>(
    `/api/papers/${encodeURIComponent(paperId)}/rag/conversations`,
  );
}

export async function createConversation(paperId: string, title?: string | null) {
  return apiFetch<RagConversation>(
    `/api/papers/${encodeURIComponent(paperId)}/rag/conversations`,
    {
      method: "POST",
      json: { title: title ?? null },
    },
  );
}

export async function listMessages(conversationId: string) {
  return apiFetch<{ items: RagMessage[] }>(
    `/api/rag/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
}

export async function sendMessage(conversationId: string, content: string) {
  return apiFetch<SendMessageResponse>(
    `/api/rag/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      json: { content },
    },
  );
}
