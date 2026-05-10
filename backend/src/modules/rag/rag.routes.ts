import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { ValidationError } from "@/shared/errors.js";
import {
  createRagPaperSchema,
  listRagPapersQuerySchema,
  ragQuerySchema,
  searchQuerySchema,
} from "./rag.dto.js";
import * as service from "./rag.service.js";

/**
 * 挂在 /api/rag 上。
 * 对应 Design_SQLite_Abstract_RAG.md §13 的 API 汇总：
 *   - GET    /api/rag/search?q=&limit=         FTS5 关键词检索
 *   - GET    /api/rag/scope                    索引规模（给 /search 右侧卡片）
 *   - POST   /api/rag/query                    完整 RAG 问答（FTS + embedding + LLM）
 *   - GET    /api/rag/papers                   列表
 *   - POST   /api/rag/papers                   录入（会顺带生成 embedding，best effort）
 *   - GET    /api/rag/papers/:id               单篇详情
 *   - POST   /api/rag/papers/:id/reindex       重新生成 embedding（LLM 新配好/换模型时）
 *   - DELETE /api/rag/papers/:id               删除
 */
export const ragRouter = createRouter();

ragRouter.get("/search", zv("query", searchQuerySchema), async (c) => {
  const { q, limit } = c.req.valid("query");
  const result = await service.searchPapers(q, limit);
  return ok(c, result);
});

ragRouter.get("/scope", async (c) => {
  const scope = await service.getScope();
  return ok(c, scope);
});

ragRouter.post("/query", zv("json", ragQuerySchema), async (c) => {
  const logger = c.get("logger");
  const { question, topK } = c.req.valid("json");
  const result = await service.askRagQuery(question, topK, logger);
  return ok(c, result);
});

ragRouter.get("/papers", zv("query", listRagPapersQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await service.listRagPapers(query);
  return ok(c, result);
});

ragRouter.post("/papers", zv("json", createRagPaperSchema), async (c) => {
  const logger = c.get("logger");
  const body = c.req.valid("json");
  const paper = await service.createRagPaper(body, logger);
  return created(c, paper);
});

/** 把 URL 段里的 id 强制转 integer，非法就直接 400 —— 不要让 ORM 抛出来后才兜。 */
function parseId(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ValidationError(`Invalid rag paper id: ${raw}`);
  }
  return n;
}

ragRouter.get("/papers/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  const paper = await service.getRagPaper(id);
  return ok(c, paper);
});

ragRouter.post("/papers/:id/reindex", async (c) => {
  const logger = c.get("logger");
  const id = parseId(c.req.param("id"));
  const result = await service.reindexRagPaper(id, logger);
  return ok(c, result);
});

ragRouter.delete("/papers/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  await service.deleteRagPaper(id);
  return c.body(null, 204);
});
