import type { RagPaperRow } from "@/db/schema.js";
import { NotFoundError } from "@/shared/errors.js";
import { buildPagination, type Paginated } from "@/shared/pagination.js";
import type {
  CreateRagPaperInput,
  ListRagPapersQuery,
  RagPaperListItemDto,
  RagScopeDto,
  RagSearchResponseDto,
  RagSearchResultDto,
} from "./rag.dto.js";
import * as repo from "./rag.repository.js";

// ---------- FTS5 查询串净化 ----------

/**
 * FTS5 保留字符 / 潜在问题字符需要剥掉，否则用户问题里一个 `?` 都会让 MATCH 报语法错。
 *
 * 我们采取"保守白名单"：只保留字母、数字、空格以及带引号的字符串；其它符号（` : * ( ) - ! " . , ; / \\ _ ' 等）
 * 统统替换为空格。在此之上把 token 以 AND 连接。
 *
 * 比 "原样塞进 MATCH + LIKE fallback" 简单得多，也足够覆盖 recent 关键词
 * （Attention mechanism bounds / MoE routing stability / KV cache compression）。
 */
export function sanitizeFtsQuery(raw: string): string {
  // 1. 只保留字母/数字/空格，其余替换为空格（Unicode 字母也保留，兼容少量中文词）。
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return "";

  // 2. 拆 token；为每个 token 加双引号（phrase 语法），避免被 FTS5 当成保留字。
  //    短于 2 个字符的 token（单字母/数字）无语义价值，直接跳过。
  const tokens = cleaned
    .split(" ")
    .filter((t) => t.length >= 2)
    .map((t) => `"${t.replace(/"/g, "")}"`);

  // 3. 用空格连接 = FTS5 的 AND 语义。对 "Attention mechanism bounds" 这样
  //    的关键词组合效果最好；若某个 token 不命中就完全不返回（收敛结果）。
  return tokens.join(" ");
}

/**
 * FTS5 `bm25()` 返回的是**负值**（越负越相关），且数量级随语料变化很大
 * （可以是 -1e-6 也可以是 -10）。绝对值映射成 0-1 的分数直接用效果很差——
 * UI 上几乎所有结果的 Relevance 都会显示成 0.00。
 *
 * 所以真正的分数计算放在 `searchPapers` 里，做结果集内的相对归一化
 * （top→1.0、bottom→0.5，落到 0.5~1.0 区间）。这里保留负值约定的注释即可。
 */

// ---------- 读模型 ----------

function parseAuthors(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toListItem(row: RagPaperRow): RagPaperListItemDto {
  return {
    id: row.id,
    title: row.title,
    authors: parseAuthors(row.authorsJson),
    venue: row.venue,
    abstract: row.abstract,
    createdAt: row.createdAt,
  };
}

// ---------- 对外方法 ----------

export async function listRagPapers(
  query: ListRagPapersQuery,
): Promise<Paginated<RagPaperListItemDto>> {
  const { rows, total } = await repo.listRagPapers(query.page, query.pageSize);
  return {
    items: rows.map(toListItem),
    pagination: buildPagination(query.page, query.pageSize, total),
  };
}

export async function getRagPaperOrThrow(id: number): Promise<RagPaperRow> {
  const row = await repo.getRagPaperById(id);
  if (!row) throw new NotFoundError("RagPaper", String(id));
  return row;
}

export async function getRagPaper(id: number): Promise<RagPaperListItemDto> {
  const row = await getRagPaperOrThrow(id);
  return toListItem(row);
}

export async function createRagPaper(input: CreateRagPaperInput): Promise<RagPaperListItemDto> {
  const row = await repo.insertRagPaper({
    title: input.title,
    abstract: input.abstract,
    authorsJson: JSON.stringify(input.authors ?? []),
    venue: input.venue ?? null,
  });
  return toListItem(row);
}

export async function deleteRagPaper(id: number): Promise<void> {
  const deleted = await repo.deleteRagPaper(id);
  if (!deleted) throw new NotFoundError("RagPaper", String(id));
}

export async function getScope(): Promise<RagScopeDto> {
  return repo.getRagScope();
}

/**
 * RAG 主查询：FTS5 关键词检索 + snippet 高亮。
 *
 * 流程：
 *  1. 净化 query —— 杜绝 FTS5 语法错误
 *  2. 若净化后为空（用户输入全是标点 / 中文单字），直接返回空列表
 *  3. 执行 MATCH，拿到 rowid + bm25 + excerpt
 *  4. 按原顺序回查 rag_papers 填充 title/authors/venue
 */
export async function searchPapers(q: string, limit: number): Promise<RagSearchResponseDto> {
  const matchExpr = sanitizeFtsQuery(q);
  if (!matchExpr) {
    return { items: [], query: q, total: 0 };
  }

  let ftsRows: repo.FtsSearchRow[];
  try {
    ftsRows = repo.ftsSearch(matchExpr, limit);
  } catch {
    // Any residual FTS5 syntax problem after sanitization → 静默返回空结果，
    // 而不是把 500 回给前端。用户看到"没结果"能自然修改查询。
    return { items: [], query: q, total: 0 };
  }

  if (ftsRows.length === 0) {
    return { items: [], query: q, total: 0 };
  }

  const orderedIds = ftsRows.map((r) => r.id);
  const paperRows = await repo.getRagPapersByIdsPreservingOrder(orderedIds);
  const rowById = new Map(paperRows.map((p) => [p.id, p]));

  // 相对排名的分数：把结果集内的 bm25 分成 top→1.0、bottom→0.0 的线性归一化。
  // 绝对 bm25 值在小语料下常常是 -1e-6 这种数量级，直接映射会让 UI 上所有
  // "Relevance" 都显示 0.00。相对排名能稳定落到 0~1 区间，并且仍然保持
  // bm25 的排序（越相关越靠前）。
  const absRanks = ftsRows.map((r) => Math.abs(r.bm25_rank));
  const maxAbs = Math.max(...absRanks);
  const minAbs = Math.min(...absRanks);
  const spread = maxAbs - minAbs;

  const items: RagSearchResultDto[] = [];
  for (const ftsRow of ftsRows) {
    const paper = rowById.get(ftsRow.id);
    if (!paper) continue; // 索引与数据偏差时跳过，不抛错

    // 单结果或 bm25 完全相同时，全部给一个折中值 0.7，避免 "score=1.0" 虚高。
    const absR = Math.abs(ftsRow.bm25_rank);
    const score =
      ftsRows.length === 1 || spread === 0 ? 0.7 : 0.5 + 0.5 * ((absR - minAbs) / spread);

    items.push({
      id: paper.id,
      title: paper.title,
      authors: parseAuthors(paper.authorsJson),
      venue: paper.venue,
      score: Number(score.toFixed(4)),
      excerpt: ftsRow.excerpt,
    });
  }

  return { items, query: q, total: items.length };
}
