export type ReproductionStatus =
  | "not_started"
  | "running"
  | "success"
  | "failed"
  | "paused";

export type ReproductionRecord = {
  id: string;
  paper: { id: string; title: string };
  device: { id: string; name: string } | null;
  status: ReproductionStatus;
  progress: number;
  resultSummary: string | null;
  artifactUrl: string | null;
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
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type UpdateReproductionInput = Omit<Partial<CreateReproductionInput>, "paperId">;
