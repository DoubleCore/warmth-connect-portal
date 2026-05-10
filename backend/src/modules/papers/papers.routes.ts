import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "@/config/env.js";
import { NotFoundError, ValidationError } from "@/shared/errors.js";
import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import {
  createPaperSchema,
  paperListQuerySchema,
  updatePaperSchema,
  upsertAnalysisSchema,
} from "./papers.dto.js";
import * as service from "./papers.service.js";
import { handlePdfUpload } from "./papers.upload.js";

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

papersRouter.patch("/:paperId", zv("json", updatePaperSchema), async (c) => {
  const paperId = c.req.param("paperId");
  const body = c.req.valid("json");
  const paper = await service.updatePaper(paperId, body);
  return ok(c, paper);
});

papersRouter.delete("/:paperId", async (c) => {
  const paperId = c.req.param("paperId");
  await service.deletePaper(paperId);
  return c.body(null, 204);
});

papersRouter.patch("/:paperId/analysis", zv("json", upsertAnalysisSchema), async (c) => {
  const paperId = c.req.param("paperId");
  const body = c.req.valid("json");
  const analysis = await service.upsertAnalysis(paperId, body);
  return ok(c, { analysis });
});

/**
 * POST /api/papers/:paperId/pdf
 *
 * Multipart upload. The PDF part must be named "file". On success we store
 * the file under PDF_STORAGE_DIR with a UUID name and attach it to the paper
 * via pdfStoragePath, so subsequent GET /api/papers/:id/pdf serves it
 * locally instead of redirecting to the remote pdfUrl.
 */
papersRouter.post("/:paperId/pdf", async (c) => {
  const paperId = c.req.param("paperId");
  // Ensure the paper exists up front so validation errors don't happen after
  // we've read the body.
  await service.getPaperOrThrow(paperId);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ValidationError("Expected multipart/form-data request with a 'file' part");
  }

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) {
    throw new ValidationError("Missing 'file' part in multipart body");
  }

  const paper = await handlePdfUpload(paperId, file);
  return created(c, paper);
});

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
