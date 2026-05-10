import { apiFetch } from "@/lib/api-client";
import type { RagPaper, RagScope, RagSearchResponse } from "@/types/rag";

/**
 * FTS5 关键词搜索，对应后端 GET /api/rag/search。
 * 空 query 会被后端校验层拒绝（400），因此调用方要自行保证 q 已 trim 且非空。
 */
export async function searchRagPapers(q: string, limit = 10) {
  return apiFetch<RagSearchResponse>("/api/rag/search", {
    query: { q, limit },
  });
}

/** 索引规模统计，用于 /search 页右侧的 Scope 卡片。 */
export async function getRagScope() {
  return apiFetch<RagScope>("/api/rag/scope");
}

/** 可选：RAG 知识库列表。当前 UI 暂未使用，保留给未来的录入/管理页。 */
export async function listRagPapers(page = 1, pageSize = 20) {
  return apiFetch<{ items: RagPaper[]; pagination: { page: number; pageSize: number; total: number } }>(
    "/api/rag/papers",
    { query: { page, pageSize } },
  );
}
