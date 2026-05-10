import { z } from "zod";

export const reproductionStatusEnum = z.enum([
  "not_started",
  "running",
  "success",
  "failed",
  "paused",
]);
export type ReproductionStatus = z.infer<typeof reproductionStatusEnum>;

export const createReproductionSchema = z.object({
  paperId: z.string().min(1),
  deviceId: z.string().nullish(),
  status: reproductionStatusEnum.default("not_started"),
  progress: z.number().int().min(0).max(100).default(0),
  resultSummary: z.string().nullish(),
  artifactUrl: z.string().url().nullish(),
  /** 训练修改记录（超参/数据/改动点等自由文本），由 reproduction-tracker skill 回写 */
  trainingNotes: z.string().nullish(),
  startedAt: z.string().datetime().nullish(),
  finishedAt: z.string().datetime().nullish(),
});
export type CreateReproductionInput = z.infer<typeof createReproductionSchema>;

export const updateReproductionSchema = createReproductionSchema.partial().omit({
  paperId: true,
});
export type UpdateReproductionInput = z.infer<typeof updateReproductionSchema>;

export type ReproductionRecordDto = {
  id: string;
  paper: {
    id: string;
    title: string;
  };
  device: {
    id: string;
    name: string;
  } | null;
  status: ReproductionStatus;
  progress: number;
  resultSummary: string | null;
  artifactUrl: string | null;
  trainingNotes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};
