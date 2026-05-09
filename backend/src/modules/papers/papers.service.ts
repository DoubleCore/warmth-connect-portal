import type { PaperRow, PaperAnalysisRow } from "@/db/schema.js";
import { NotFoundError } from "@/shared/errors.js";
import { buildPagination, type Paginated } from "@/shared/pagination.js";
import type {
  CreatePaperInput,
  PaperDetailDto,
  PaperListItemDto,
  PaperListQuery,
  UpsertAnalysisInput,
} from "./papers.dto.js";
import * as repo from "./papers.repository.js";

function parseAuthors(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toListItem(row: PaperRow): PaperListItemDto {
  return {
    id: row.id,
    title: row.title,
    authors: parseAuthors(row.authorsJson),
    field: row.field,
    source: row.source,
    publishedYear: row.publishedYear,
    paperUrl: row.paperUrl,
    pdfUrl: row.pdfUrl,
  };
}

function toAnalysisDto(row: PaperAnalysisRow | null): PaperDetailDto["analysis"] {
  if (!row) return null;
  return {
    taskDefinition: row.taskDefinition,
    researchQuestions: row.researchQuestions,
    methodOverview: row.methodOverview,
    metrics: row.metrics,
    conclusion: row.conclusion,
    notes: row.notes,
  };
}

export async function listPapers(query: PaperListQuery): Promise<Paginated<PaperListItemDto>> {
  const { rows, total } = await repo.listPapers(query);
  return {
    items: rows.map(toListItem),
    pagination: buildPagination(query.page, query.pageSize, total),
  };
}

export async function getPaperDetail(paperId: string): Promise<PaperDetailDto> {
  const paper = await repo.getPaperById(paperId);
  if (!paper) throw new NotFoundError("Paper", paperId);
  const analysis = await repo.getAnalysisByPaperId(paperId);
  return {
    paper: { ...toListItem(paper), abstract: paper.abstract },
    analysis: toAnalysisDto(analysis),
  };
}

export async function getPaperOrThrow(paperId: string): Promise<PaperRow> {
  const paper = await repo.getPaperById(paperId);
  if (!paper) throw new NotFoundError("Paper", paperId);
  return paper;
}

export async function createPaper(input: CreatePaperInput): Promise<PaperListItemDto> {
  const row = await repo.insertPaper(input);
  return toListItem(row);
}

export async function upsertAnalysis(paperId: string, input: UpsertAnalysisInput) {
  await getPaperOrThrow(paperId);
  const row = await repo.upsertAnalysis(paperId, input);
  return toAnalysisDto(row);
}
