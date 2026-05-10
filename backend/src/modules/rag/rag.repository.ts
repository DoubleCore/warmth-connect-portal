import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, rawDb } from "@/db/client.js";
import { ragPapers, type RagPaperRow } from "@/db/schema.js";
import { offset } from "@/shared/pagination.js";

/**
 * 低层仓储：直接与 `rag_papers` + `rag_papers_fts` 打交道。
 *
 * 常规 CRUD 用 Drizzle ORM；FTS5 的 MATCH 和 bm25()/snippet() 都是 SQLite 方言，
 * 绕过 ORM、走 better-sqlite3 裸连接 `rawDb`，prepared statement + 绑定参数
 * 避免 SQL 注入，FTS 查询串本身由 service 层做净化。
 */

export async function listRagPapers(
  page: number,
  pageSize: number,
): Promise<{ rows: RagPaperRow[]; total: number }> {
  const rows = await db
    .select()
    .from(ragPapers)
    .orderBy(desc(ragPapers.createdAt), desc(ragPapers.id))
    .limit(pageSize)
    .offset(offset(page, pageSize));

  const totalResult = await db.select({ count: sql<number>`count(*)` }).from(ragPapers);

  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getRagPaperById(id: number): Promise<RagPaperRow | null> {
  const rows = await db.select().from(ragPapers).where(eq(ragPapers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertRagPaper(input: {
  title: string;
  abstract: string;
  authorsJson: string;
  venue: string | null;
}): Promise<RagPaperRow> {
  const [row] = await db
    .insert(ragPapers)
    .values({
      title: input.title,
      abstract: input.abstract,
      authorsJson: input.authorsJson,
      venue: input.venue,
    })
    .returning();
  if (!row) throw new Error("Failed to insert rag paper");
  return row;
}

export async function deleteRagPaper(id: number): Promise<boolean> {
  const result = await db.delete(ragPapers).where(eq(ragPapers.id, id)).returning();
  return result.length > 0;
}

/**
 * 作用域统计（给 /search 页右侧 scope 卡片使用）。
 * totalAbstractChars = SUM(LENGTH(abstract))，比真正做 tokenize 便宜得多，
 * 前端展示时可以换算成 "~tokens" 近似值（/4）。
 */
export async function getRagScope(): Promise<{
  papersIndexed: number;
  totalAbstractChars: number;
}> {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      chars: sql<number>`coalesce(sum(length(${ragPapers.abstract})), 0)`,
    })
    .from(ragPapers);
  const r = rows[0];
  return {
    papersIndexed: Number(r?.count ?? 0),
    totalAbstractChars: Number(r?.chars ?? 0),
  };
}

/**
 * FTS5 搜索结果的原始行（id + score + excerpt）。排序已由 SQL 层完成。
 */
export type FtsSearchRow = {
  id: number;
  bm25_rank: number;
  excerpt: string;
};

/**
 * 用 FTS5 做一次 MATCH 检索。
 *
 * @param matchExpr 已经过净化、可直接作为 FTS5 MATCH 参数的查询串
 * @param limit     返回条数上限
 *
 * snippet() 参数说明：
 *   · 第 2 个 1 指只对第 1 列（= abstract，因为 title 是第 0 列）做片段抽取
 *   · '<mark>' / '</mark>' 作为命中词的起止标记，前端可直接渲染
 *   · '...' 用作省略号
 *   · 30 指每个片段最多 30 个 token
 *
 * bm25() 返回值是"越小越相关"的负值/小正数，service 层会做归一化到 [0, 1]。
 */
export function ftsSearch(matchExpr: string, limit: number): FtsSearchRow[] {
  const stmt = rawDb.prepare(
    `SELECT
        rowid AS id,
        bm25(rag_papers_fts) AS bm25_rank,
        snippet(rag_papers_fts, 1, '<mark>', '</mark>', '...', 30) AS excerpt
      FROM rag_papers_fts
      WHERE rag_papers_fts MATCH ?
      ORDER BY bm25_rank
      LIMIT ?`,
  );
  return stmt.all(matchExpr, limit) as FtsSearchRow[];
}

/**
 * 根据 id 批量拉取 rag_papers，按 orderedIds 的原顺序返回。
 *
 * 这里刻意走 Drizzle（`select().from(ragPapers).where(inArray(...))`）而不是
 * 手写 `rawDb.prepare("SELECT * ...")`——因为 rawDb 返回的是原始 snake_case
 * 列名（authors_json），而 Drizzle 在 `casing: "snake_case"` 下会把它映射成
 * camelCase（authorsJson）。service 层统一用 camelCase，混用就会踩"authors
 * 永远是空数组"这种 bug。
 */
export async function getRagPapersByIdsPreservingOrder(
  orderedIds: number[],
): Promise<RagPaperRow[]> {
  if (orderedIds.length === 0) return [];
  const rows = await db.select().from(ragPapers).where(inArray(ragPapers.id, orderedIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: RagPaperRow[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (row) out.push(row);
  }
  return out;
}
