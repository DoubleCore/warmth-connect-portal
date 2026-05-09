import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { env } from "@/config/env.js";
import { NotFoundError } from "@/shared/errors.js";
import {
  createPaperSchema,
  paperListQuerySchema,
  upsertAnalysisSchema,
} from "./papers.dto.js";
import * as service from "./papers.service.js";

export const papersRouter = new Hono();

papersRouter.get("/", zValidator("query", paperListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await service.listPapers(query);
  return c.json(result);
});

papersRouter.post("/", zValidator("json", createPaperSchema), async (c) => {
  const body = c.req.valid("json");
  const created = await service.createPaper(body);
  return c.json(created, 201);
});

papersRouter.get("/:paperId/detail", async (c) => {
  const paperId = c.req.param("paperId");
  const detail = await service.getPaperDetail(paperId);
  return c.json(detail);
});

papersRouter.patch(
  "/:paperId/analysis",
  zValidator("json", upsertAnalysisSchema),
  async (c) => {
    const paperId = c.req.param("paperId");
    const body = c.req.valid("json");
    const analysis = await service.upsertAnalysis(paperId, body);
    return c.json({ analysis });
  },
);

/**
 * GET /api/papers/:paperId/pdf
 *
 * 优先级：
 * 1. 若 paper.pdfStoragePath 存在且文件存在，直接以 application/pdf 返回
 * 2. 否则若 paper.pdfUrl 存在，302 重定向
 * 3. 都没有则 404
 */
papersRouter.get("/:paperId/pdf", async (c) => {
  const paperId = c.req.param("paperId");
  const paper = await service.getPaperOrThrow(paperId);

  if (paper.pdfStoragePath) {
    const absPath = resolve(env.PDF_STORAGE_DIR, paper.pdfStoragePath);
    try {
      const s = await stat(absPath);
      if (s.isFile()) {
        const stream = createReadStream(absPath);
        // Hono supports Web Streams via ReadableStream conversion.
        const webStream = new ReadableStream<Uint8Array>({
          start(controller) {
            stream.on("data", (chunk: Buffer | string) => {
              const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
              controller.enqueue(new Uint8Array(buf));
            });
            stream.on("end", () => controller.close());
            stream.on("error", (err) => controller.error(err));
          },
          cancel() {
            stream.destroy();
          },
        });
        return new Response(webStream, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(s.size),
            "Content-Disposition": `attachment; filename="${encodeURIComponent(paper.title)}.pdf"`,
          },
        });
      }
    } catch {
      // fallthrough to remote url
    }
  }

  if (paper.pdfUrl) {
    return c.redirect(paper.pdfUrl, 302);
  }

  throw new NotFoundError("PDF for paper", paperId);
});
