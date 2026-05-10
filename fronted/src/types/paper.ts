/**
 * Mirrors the backend `PaperListItemDto` / `PaperDetailDto` / `PaperListQuery`
 * shapes (see backend/src/modules/papers/papers.dto.ts).
 *
 * Keep field names in sync with the backend DTO exactly. Any divergence means
 * either the backend or this file is wrong — not both at once.
 */

export type PaperListItem = {
  id: string;
  title: string;
  authors: string[];
  field: string | null;
  source: string | null;
  publishedYear: number | null;
  paperUrl: string | null;
  pdfUrl: string | null;
  /** Code repository URL (GitHub/GitLab), written by paper-code-finder / repo-backfill skills. */
  repoUrl: string | null;
};

export type PaperAnalysis = {
  taskDefinition: string | null;
  researchQuestions: string | null;
  methodOverview: string | null;
  metrics: string | null;
  conclusion: string | null;
  notes: string | null;
};

export type PaperDetail = {
  paper: PaperListItem & { abstract: string | null };
  analysis: PaperAnalysis | null;
};

export type PaperListQuery = {
  keyword?: string;
  field?: string;
  source?: string;
  year?: number;
  page?: number;
  pageSize?: number;
};
