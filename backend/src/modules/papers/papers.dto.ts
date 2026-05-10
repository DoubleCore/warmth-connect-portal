import { z } from "zod";
import { paginationQuerySchema } from "@/shared/pagination.js";

export const paperListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().min(1).optional(),
  field: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  year: z.coerce.number().int().optional(),
});

export type PaperListQuery = z.infer<typeof paperListQuerySchema>;

/** 用于 POST /api/papers 与 seed 的新增 DTO */
export const createPaperSchema = z.object({
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).default([]),
  abstract: z.string().nullish(),
  field: z.string().nullish(),
  source: z.string().nullish(),
  publishedYear: z.number().int().nullish(),
  paperUrl: z.string().url().nullish(),
  pdfUrl: z.string().url().nullish(),
  /** 代码仓库 URL，常由 paper-code-finder / repo-backfill skill 写入 */
  repoUrl: z.string().url().nullish(),
});
export type CreatePaperInput = z.infer<typeof createPaperSchema>;

/** PATCH /api/papers/:id — 更新论文元数据字段（部分更新） */
export const updatePaperSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    authors: z.array(z.string().trim().min(1)).optional(),
    abstract: z.string().nullish(),
    field: z.string().nullish(),
    source: z.string().nullish(),
    publishedYear: z.number().int().nullish(),
    paperUrl: z.string().url().nullish(),
    pdfUrl: z.string().url().nullish(),
    /** 代码仓库 URL，由 paper-code-finder / repo-backfill skill 回写 */
    repoUrl: z.string().url().nullish(),
    /** 本地 PDF 相对路径（相对 PDF_STORAGE_DIR），一般由上传接口写入，但也接受直接 PATCH */
    pdfStoragePath: z.string().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field is required" });
export type UpdatePaperInput = z.infer<typeof updatePaperSchema>;

/** PATCH /api/papers/:id/analysis */
export const upsertAnalysisSchema = z.object({
  taskDefinition: z.string().nullish(),
  researchQuestions: z.string().nullish(),
  methodOverview: z.string().nullish(),
  metrics: z.string().nullish(),
  conclusion: z.string().nullish(),
  notes: z.string().nullish(),
});
export type UpsertAnalysisInput = z.infer<typeof upsertAnalysisSchema>;

/** 返回给前端的精简列表项 */
export type PaperListItemDto = {
  id: string;
  title: string;
  authors: string[];
  field: string | null;
  source: string | null;
  publishedYear: number | null;
  paperUrl: string | null;
  pdfUrl: string | null;
  repoUrl: string | null;
};

/** 返回给前端的详情 */
export type PaperDetailDto = {
  paper: PaperListItemDto & { abstract: string | null };
  analysis: {
    taskDefinition: string | null;
    researchQuestions: string | null;
    methodOverview: string | null;
    metrics: string | null;
    conclusion: string | null;
    notes: string | null;
  } | null;
};
