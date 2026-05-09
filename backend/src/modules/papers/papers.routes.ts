import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "@/config/env.js";
import { NotFoundError } from "@/shared/errors.js";
import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import {
  createPaperSchema,
  paperListQuerySchema,
  upsertAnalysisSchema,
} from "./papers.dto.js";
import * as service from "./papers.service.js";

export const papersRouter = createRouter();

papersRouter.get("/", zv("query", paperListQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const result = await service.listPapers(query);
  return ok(c, result);
});

papersRouter.post("/", zv("json", createPaperSchema), async (c) => {
  const body = c.req.valid("json");
  const paper = await service.createPaper(body);
  return created(c, paper);
});

papersRouter.get("/:paperId/detail", async (c) => {
  const paperId = c.req.param("paperId");
  const detail = await service.getPaperDetail(paperId);
  return ok(c, detail);
});

papersRouter.patch(
  "/:paperId/analysis",
  zv("json", upsertAnalysisSchema),
  async (c) => {
    const paperId = c.req.param("paperId");
    const body = c.req.valid("json");
    const analysis = await service.upsertAnalysis(paperId, body);
    return ok(c, { analysis });
  },
);

/**
 * GET /api/papers/:paperId/pdf
 *
 * 优先级：
 * 1. 若 paper.pdfStoragePath 存在且文件存在，直接以 application/pdf 返回
 * 2. 否则若 paper.pdfUrl 存在，302 重定向
 * 3. 都没有则 404
 *
 * 注意：这个端点返回的是二进制流或重定向，不使用成功信封包装。
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
            "X-Request-Id": c.get("requestId"),
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
