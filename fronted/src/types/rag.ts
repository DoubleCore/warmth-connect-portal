/**
 * RAG 相关类型。
 *
 * 本版本 RAG 分两个能力面：
 *   1. FTS5 关键词检索        → GET  /api/rag/search           → RagSearchResponse
 *   2. 完整问答（LLM 生成）  → POST /api/rag/query            → RagQueryResponse
 *
 * 两个接口的数据形状刻意分开：搜索返回 excerpt（含 <mark> 高亮），问答返回
 * plain snippet + LLM 生成的 answer。前端 /search 页以问答为主、检索为辅。
 */

/** /search 页每条命中结果。字段对齐后端 `RagSearchResultDto`。 */
export type RagSearchResult = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  score: number; // [0, 1]，越大越相关（结果集内相对排名）
  excerpt: string; // FTS5 snippet()，命中词用 <mark> 包裹，前端可直接 dangerouslySetInnerHTML
};

export type RagSearchResponse = {
  items: RagSearchResult[];
  query: string;
  total: number;
};

/** /search 页右侧 scope 卡片。 */
export type RagScope = {
  papersIndexed: number;
  totalAbstractChars: number;
};

/** POST /api/rag/query 的单条引用。字段对齐后端 RagQueryReferenceDto。 */
export type RagQueryReference = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  /** abstract 截断后的片段（纯文本，不含 <mark>） */
  snippet: string;
  /** [0.5, 1]，UI 直接当百分比渲染即可 */
  score: number;
};

/** POST /api/rag/query 返回体。 */
export type RagQueryResponse = {
  answer: string;
  references: RagQueryReference[];
  question: string;
  /** true 表示 embedding 参与了 rerank，false 则完全依赖 FTS 排序 */
  usedEmbedding: boolean;
  /** 生成答案用的 chat model 名（例如 "gpt-4o-mini"），前端可展示在上下文面板 */
  model: string;
};

/** 列表 / 详情 DTO。给未来的"RAG 论文录入页"预留；/search 不直接用。 */
export type RagPaper = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  abstract: string;
  createdAt: string;
};
