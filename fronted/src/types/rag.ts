/**
 * RAG 检索相关类型。
 *
 * 本版本 RAG = 基于 SQLite FTS5 的关键词检索（详见 backend Design_SQLite_Abstract_RAG.md）。
 * 不再包含会话 / 消息结构 —— 相关页面和 API 已从项目中移除。
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

/** 列表 / 详情 DTO。给未来的"RAG 论文录入页"预留；/search 不直接用。 */
export type RagPaper = {
  id: number;
  title: string;
  authors: string[];
  venue: string | null;
  abstract: string;
  createdAt: string;
};
