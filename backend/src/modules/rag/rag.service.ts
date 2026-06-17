import type { Logger } from "pino";
import type { RagPaperRow } from "@/db/schema.js";
import { env } from "@/config/env.js";
import { NotFoundError } from "@/shared/errors.js";
import { buildPagination, type Paginated } from "@/shared/pagination.js";
import { baseLogger } from "@/shared/logger.js";
import type {
  CreateRagPaperInput,
  ListRagPapersQuery,
  RagPaperListItemDto,
  RagQueryReferenceDto,
  RagQueryResponseDto,
  RagScopeDto,
  RagSearchResponseDto,
  RagSearchResultDto,
} from "./rag.dto.js";
import { llmClient, LLMError } from "./llm.client.js";
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

export async function createRagPaper(
  input: CreateRagPaperInput,
  logger: Logger = baseLogger,
): Promise<RagPaperListItemDto> {
  const row = await repo.insertRagPaper({
    title: input.title,
    abstract: input.abstract,
    authorsJson: JSON.stringify(input.authors ?? []),
    venue: input.venue ?? null,
  });
  // Best-effort 生成 embedding：LLM 未配置或调用失败都不阻断论文录入。
  // 后续可以通过 POST /api/rag/papers/:id/reindex 手动回填。
  await tryEmbedAndStore(row, logger);
  return toListItem(row);
}

/**
 * 为单篇 rag paper 生成并落库 embedding。失败只打 warn，不抛。
 * 录入 / reindex 都走这个。
 */
async function tryEmbedAndStore(row: RagPaperRow, logger: Logger): Promise<boolean> {
  if (!llmClient.isConfigured()) {
    logger.debug(
      { paperId: row.id },
      "Skipping embedding generation: LLM_API_KEY not configured",
    );
    return false;
  }
  if (!env.LLM_EMBEDDINGS_ENABLED) {
    logger.debug(
      { paperId: row.id },
      "Skipping embedding generation: LLM_EMBEDDINGS_ENABLED=false (provider has no /embeddings)",
    );
    return false;
  }
  const text = buildEmbeddingText(row.title, row.abstract);
  try {
    const vec = await llmClient.embedText(text, logger);
    await repo.upsertRagPaperEmbedding({
      paperId: row.id,
      embeddingText: text,
      embeddingJson: JSON.stringify(vec),
      embeddingModel: env.LLM_EMBEDDING_MODEL,
    });
    logger.info({ paperId: row.id, dim: vec.length }, "Embedding upserted");
    return true;
  } catch (err) {
    logger.warn(
      { err, paperId: row.id },
      "Failed to generate embedding; paper is still indexed for FTS search",
    );
    return false;
  }
}

/** 拼 embedding 用的原文。对齐 Design_SQLite_Abstract_RAG.md §7.3。 */
function buildEmbeddingText(title: string, abstract: string): string {
  return `Title: ${title}\n\nAbstract:\n${abstract}`;
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


// ---------- RAG Query：FTS 召回 → Embedding rerank → LLM 生成 ----------

/**
 * FTS 预召回上限。
 *   · 30 篇是 Design 文档 §10.1 推荐值
 *   · 太多会浪费 embedding 调用（其实我们只读 DB，无所谓）+ 占用 prompt token
 *   · 太少会漏掉语义相近但关键词不命中的论文
 * 候选里选 topK（默认 5）喂给 LLM。
 */
const FTS_CANDIDATE_LIMIT = 30;

/**
 * 单篇参考论文喂给 LLM 的 abstract 截断长度。
 * abstract 本身就不长（200-1500 字），400 词足够；超出部分截掉并加省略号，
 * 控制整个 prompt 的 token 量。前端展示用的 snippet 也共用这个长度。
 */
const REFERENCE_SNIPPET_MAX_CHARS = 1200;

/**
 * 对外 API：POST /api/rag/query
 *
 * 流程（Design §9.1）：
 *   1. 清洗 question → FTS5 MATCH 表达式
 *   2. FTS 召回最多 FTS_CANDIDATE_LIMIT 篇
 *   3. 如果 LLM 已配好 key：
 *        a. 对 question embed
 *        b. 把候选里有 embedding 的论文做 cosine similarity rerank
 *        c. 取 Top K；embedding 缺失的条目 fallback 到 FTS 排序末尾
 *      否则（LLM 未配好或 embedding 全无）：直接用 FTS 排序截 Top K
 *   4. 拼 prompt，调 chatComplete
 *   5. 返回 answer + references
 *
 * 失败处理：
 *   · LLM 未配好 → LLMError('LLM_NOT_CONFIGURED', 503)，路由层直接吐 503
 *   · FTS 没命中 → 走特殊路径：不调 LLM，直接返回"找不到相关论文"的答案，
 *                  避免白白花一次 chat completion 的钱
 */
export async function askRagQuery(
  question: string,
  topK: number,
  logger: Logger = baseLogger,
): Promise<RagQueryResponseDto> {
  if (!llmClient.isConfigured()) {
    throw new LLMError(
      "LLM_NOT_CONFIGURED",
      "LLM_API_KEY 未配置，/api/rag/query 暂不可用。请在 backend/.env 中配置后重启服务。",
      503,
    );
  }

  // Step 1 + 2: FTS 召回候选
  const matchExpr = sanitizeFtsQuery(question);
  let ftsRows: repo.FtsSearchRow[] = [];
  if (matchExpr) {
    try {
      ftsRows = repo.ftsSearch(matchExpr, FTS_CANDIDATE_LIMIT);
    } catch (err) {
      // FTS 语法层面兜不住的问题退化为"没命中"
      logger.warn({ err, matchExpr }, "FTS match failed; falling back to empty candidates");
      ftsRows = [];
    }
  }

  if (ftsRows.length === 0) {
    return emptyAnswerResponse(question);
  }

  const candidateIds = ftsRows.map((r) => r.id);
  const candidateRows = await repo.getRagPapersByIdsPreservingOrder(candidateIds);
  const rowById = new Map(candidateRows.map((r) => [r.id, r]));

  // Step 3: embedding rerank（best effort）
  let rerankedIds: number[] = candidateIds; // 默认用 FTS 顺序
  let usedEmbedding = false;
  if (!env.LLM_EMBEDDINGS_ENABLED) {
    // 后端无 /embeddings（如 DeepSeek）：直接用 FTS 排序，省掉一个必失败的请求。
    logger.debug(
      { candidateCount: candidateIds.length },
      "Embeddings disabled (LLM_EMBEDDINGS_ENABLED=false); using FTS ranking",
    );
  } else {
    try {
      const qVec = await llmClient.embedText(question, logger);
      const embeddings = await repo.getRagPaperEmbeddingsByIds(candidateIds);
      if (embeddings.length > 0) {
        rerankedIds = rerankByCosine(candidateIds, qVec, embeddings);
        usedEmbedding = true;
        logger.debug(
          { totalCandidates: candidateIds.length, withEmbedding: embeddings.length },
          "Reranked candidates by embedding similarity",
        );
      } else {
        logger.warn(
          { candidateCount: candidateIds.length },
          "No embeddings found for any candidate; falling back to FTS ranking",
        );
      }
    } catch (err) {
      // embedding 失败不影响主流程：退回 FTS 排序，仍然能生成回答
      logger.warn({ err }, "Embedding rerank failed; falling back to FTS ranking");
    }
  }

  const topIds = rerankedIds.slice(0, topK);
  const topRows = topIds
    .map((id) => rowById.get(id))
    .filter((r): r is RagPaperRow => Boolean(r));

  if (topRows.length === 0) {
    return emptyAnswerResponse(question);
  }

  // Step 4: 调 LLM
  const answer = await generateAnswer(question, topRows, logger);

  // Step 5: 打分 + 返回
  const references = buildReferencesDto(topRows, rerankedIds, ftsRows);

  return {
    answer,
    references,
    question,
    usedEmbedding,
    model: env.LLM_CHAT_MODEL,
  };
}

function emptyAnswerResponse(question: string): RagQueryResponseDto {
  return {
    answer:
      "在当前论文索引里没有找到与你问题相关的论文。你可以换一种说法再问，或者先通过 POST /api/rag/papers 录入一些论文。",
    references: [],
    question,
    usedEmbedding: false,
    model: env.LLM_CHAT_MODEL,
  };
}

/**
 * 对候选 id 做余弦相似度重排。没有 embedding 的条目按 FTS 原顺序附在末尾。
 */
function rerankByCosine(
  candidateIds: number[],
  queryVec: number[],
  embeddings: Array<{ paperId: number; embeddingJson: string }>,
): number[] {
  const vecById = new Map<number, number[]>();
  for (const e of embeddings) {
    try {
      const vec = JSON.parse(e.embeddingJson) as unknown;
      if (Array.isArray(vec) && vec.every((n) => typeof n === "number")) {
        vecById.set(e.paperId, vec as number[]);
      }
    } catch {
      // corrupt row, ignore
    }
  }

  const scored: Array<{ id: number; score: number }> = [];
  const unscored: number[] = [];
  for (const id of candidateIds) {
    const v = vecById.get(id);
    if (v && v.length === queryVec.length) {
      scored.push({ id, score: cosineSimilarity(queryVec, v) });
    } else {
      unscored.push(id);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return [...scored.map((s) => s.id), ...unscored];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * 构造 LLM prompt 并调用。
 * 对齐 Design_SQLite_Abstract_RAG.md §11。
 */
async function generateAnswer(
  question: string,
  refs: RagPaperRow[],
  logger: Logger,
): Promise<string> {
  const systemPrompt =
    "You are a research paper assistant. Answer the user's question ONLY based on the provided paper titles and abstracts. " +
    "If the provided abstracts do not contain enough information to answer, say so explicitly instead of inventing facts. " +
    "Cite paper numbers like [1], [2] inline. Keep answers concise (2-4 paragraphs). Answer in the same language as the user's question.";

  const refBlocks = refs
    .map((r, idx) => {
      const abstractSnippet =
        r.abstract.length > REFERENCE_SNIPPET_MAX_CHARS
          ? r.abstract.slice(0, REFERENCE_SNIPPET_MAX_CHARS) + "..."
          : r.abstract;
      return `[${idx + 1}]\nTitle: ${r.title}\nAbstract: ${abstractSnippet}`;
    })
    .join("\n\n");

  const userPrompt = `User question:\n${question}\n\nRelevant papers:\n\n${refBlocks}`;

  logger.debug({ refs: refs.length, questionLen: question.length }, "Calling LLM for RAG answer");

  return llmClient.chatComplete(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    logger,
    { temperature: 0.2 },
  );
}

/**
 * 把最终 Top K 行 + 原排名 + FTS 分数融合成前端用的 reference DTO。
 * score 归一化策略：rerankedIds 的索引 → 越前分数越高，线性落到 [0.5, 1]。
 * （bm25/余弦原始值数量级不稳定，UI 上直接展示会很糊）
 */
function buildReferencesDto(
  topRows: RagPaperRow[],
  rerankedIds: number[],
  ftsRows: repo.FtsSearchRow[],
): RagQueryReferenceDto[] {
  const topCount = topRows.length;
  const ftsById = new Map(ftsRows.map((r) => [r.id, r]));
  void ftsById; // reserved for future use (showing fts excerpt)

  return topRows.map((row, idx) => {
    // idx 是 top-k 内部的位置（0 最相关）。映射到 [0.5, 1]：
    //   idx=0 → 1.0，idx=topCount-1 → 0.5；单条时给 0.9 避免虚满分。
    const score =
      topCount === 1
        ? 0.9
        : Number((1 - (idx / (topCount - 1)) * 0.5).toFixed(4));

    const snippet =
      row.abstract.length > REFERENCE_SNIPPET_MAX_CHARS
        ? row.abstract.slice(0, REFERENCE_SNIPPET_MAX_CHARS) + "..."
        : row.abstract;

    return {
      id: row.id,
      title: row.title,
      authors: parseAuthors(row.authorsJson),
      venue: row.venue,
      snippet,
      score,
    };
  });
}

// ---------- Reindex ----------

/**
 * POST /api/rag/papers/:id/reindex —— 给单篇论文重新生成 embedding。
 * 用场景：早期录入的论文（LLM 当时没配好）需要回填；或者换了 embedding 模型。
 */
export async function reindexRagPaper(
  id: number,
  logger: Logger = baseLogger,
): Promise<{ paperId: number; reindexed: boolean }> {
  const row = await getRagPaperOrThrow(id);
  if (!llmClient.isConfigured()) {
    throw new LLMError(
      "LLM_NOT_CONFIGURED",
      "LLM_API_KEY 未配置，无法生成 embedding。",
      503,
    );
  }
  const ok = await tryEmbedAndStore(row, logger);
  return { paperId: id, reindexed: ok };
}
