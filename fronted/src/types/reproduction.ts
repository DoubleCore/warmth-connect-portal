export type ReproductionStatus = "not_started" | "running" | "success" | "failed" | "paused";

export type ReproductionRecord = {
  id: string;
  paper: { id: string; title: string };
  device: { id: string; name: string } | null;
  status: ReproductionStatus;
  progress: number;
  resultSummary: string | null;
  artifactUrl: string | null;
  /** Free-form training notes (hyperparam tweaks, data cleaning, diffs…) written by reproduction-tracker. */
  trainingNotes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type CreateReproductionInput = {
  paperId: string;
  deviceId?: string | null;
  status?: ReproductionStatus;
  progress?: number;
  resultSummary?: string | null;
  artifactUrl?: string | null;
  trainingNotes?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type UpdateReproductionInput = Omit<Partial<CreateReproductionInput>, "paperId">;
