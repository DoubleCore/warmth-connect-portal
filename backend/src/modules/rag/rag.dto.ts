import { z } from "zod";

/** GET /api/rag/search?q=&limit= */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

/** POST /api/rag/query —— 完整 RAG 问答（FTS 召回 + embedding rerank + LLM 回答） */
export const ragQuerySchema = z.object({
  question: z.string().trim().min(1).max(2000),
  topK: z.coerce.number().int().min(1).max(10).default(5),
});
export type RagQueryInput = z.infer<typeof ragQuerySchema>;

/** POST /api/rag/papers */
export const createRagPaperSchema = z.object({
  title: z.string().trim().min(1).max(500),
  abstract: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).max(50).optional(),
  venue: z.string().trim().max(200).nullish(),
});
export type CreateRagPaperInput = z.infer<typeof createRagPaperSchema>;

/** GET /api/rag/papers query */
export const listRagPapersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListRagPapersQuery = z.infer<typeof listRagPapersQuerySchema>;

/** 搜索结果条目 —— 字段对齐前端 /search mock 的 UI 需要。 */
export type RagSearchResultDto = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  score: number; // 归一化到 [0, 1]，越高越相关
  excerpt: string; // FTS5 snippet()，命中词用 <mark> 包裹
};

export type RagSearchResponseDto = {
  items: RagSearchResultDto[];
  query: string;
  total: number;
};

/** GET /api/rag/papers 列表返回条目。不带 excerpt/score。 */
export type RagPaperListItemDto = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  abstract: string;
  createdAt: string;
};

/** 搜索页右侧 scope 面板的统计信息。 */
export type RagScopeDto = {
  papersIndexed: number;
  totalAbstractChars: number;
};

/** POST /api/rag/query 返回的引用项。 */
export type RagQueryReferenceDto = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  /** 用于 UI 展示的摘要片段（abstract 前 400 字） */
  snippet: string;
  /** 综合排序分数（FTS + embedding 归一后），[0, 1]，越大越相关 */
  score: number;
};

/** POST /api/rag/query 返回体。 */
export type RagQueryResponseDto = {
  answer: string;
  references: RagQueryReferenceDto[];
  /** 回显用户问题，前端渲染对话气泡时方便对齐 */
  question: string;
  /** true = 靠 embedding rerank 给出 Top K；false = embedding 不可用，只靠 FTS 排序 */
  usedEmbedding: boolean;
  /** 生成答案用的 chat model 名，前端侧栏可以展示 */
  model: string;
};
