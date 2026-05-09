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
 * bm25() 是越小越相关（通常 0 ~ 数十）。这里把它归一化到 (0, 1]：
 *   score = 1 / (1 + rank)
 * 完美命中时 rank≈0 → score≈1；弱相关时 rank 很大 → score→0。
 */
function bm25ToScore(bm25Rank: number): number {
  // FTS5 在某些极端命中下会给到负值（"越负越相关"），先夹成 0 作下界。
  const r = Math.max(0, bm25Rank);
  return 1 / (1 + r);
}

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

export async function createRagPaper(
  input: CreateRagPaperInput,
): Promise<RagPaperListItemDto> {
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
export async function searchPapers(
  q: string,
  limit: number,
): Promise<RagSearchResponseDto> {
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
  const paperRows = repo.getRagPapersByIdsPreservingOrder(orderedIds);
  const rowById = new Map(paperRows.map((p) => [p.id, p]));

  const items: RagSearchResultDto[] = [];
  for (const ftsRow of ftsRows) {
    const paper = rowById.get(ftsRow.id);
    if (!paper) continue; // 索引与数据偏差时跳过，不抛错
    items.push({
      id: paper.id,
      title: paper.title,
      authors: parseAuthors(paper.authorsJson),
      venue: paper.venue,
      score: Number(bm25ToScore(ftsRow.bm25_rank).toFixed(4)),
      excerpt: ftsRow.excerpt,
    });
  }

  return { items, query: q, total: items.length };
}
