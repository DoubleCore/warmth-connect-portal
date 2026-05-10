import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client.js";
import { paperAnalysis, papers, type PaperRow } from "@/db/schema.js";
import { offset } from "@/shared/pagination.js";
import type { CreatePaperInput, PaperListQuery, UpdatePaperInput, UpsertAnalysisInput } from "./papers.dto.js";

function buildFilters(query: PaperListQuery) {
  const clauses = [];
  if (query.keyword) {
    const kw = `%${query.keyword}%`;
    clauses.push(
      or(
        like(papers.title, kw),
        like(papers.abstract, kw),
        // authors stored as JSON string; LIKE works for substring match
        like(papers.authorsJson, kw),
      ),
    );
  }
  if (query.field) clauses.push(eq(papers.field, query.field));
  if (query.source) clauses.push(eq(papers.source, query.source));
  if (query.year !== undefined) clauses.push(eq(papers.publishedYear, query.year));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listPapers(query: PaperListQuery): Promise<{
  rows: PaperRow[];
  total: number;
}> {
  const where = buildFilters(query);

  const rows = await db
    .select()
    .from(papers)
    .where(where)
    .orderBy(desc(papers.createdAt), asc(papers.id))
    .limit(query.pageSize)
    .offset(offset(query.page, query.pageSize));

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(papers)
    .where(where);

  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getPaperById(id: string): Promise<PaperRow | null> {
  const rows = await db.select().from(papers).where(eq(papers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAnalysisByPaperId(paperId: string) {
  const rows = await db
    .select()
    .from(paperAnalysis)
    .where(eq(paperAnalysis.paperId, paperId))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertPaper(input: CreatePaperInput): Promise<PaperRow> {
  const [row] = await db
    .insert(papers)
    .values({
      title: input.title,
      authorsJson: JSON.stringify(input.authors ?? []),
      abstract: input.abstract ?? null,
      field: input.field ?? null,
      source: input.source ?? null,
      publishedYear: input.publishedYear ?? null,
      paperUrl: input.paperUrl ?? null,
      pdfUrl: input.pdfUrl ?? null,
      repoUrl: input.repoUrl ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert paper");
  return row;
}

export async function updatePaper(
  id: string,
  input: UpdatePaperInput,
): Promise<PaperRow | null> {
  // Only set the columns the caller provided so PATCH stays truly partial.
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.authors !== undefined) patch.authorsJson = JSON.stringify(input.authors);
  if (input.abstract !== undefined) patch.abstract = input.abstract ?? null;
  if (input.field !== undefined) patch.field = input.field ?? null;
  if (input.source !== undefined) patch.source = input.source ?? null;
  if (input.publishedYear !== undefined) patch.publishedYear = input.publishedYear ?? null;
  if (input.paperUrl !== undefined) patch.paperUrl = input.paperUrl ?? null;
  if (input.pdfUrl !== undefined) patch.pdfUrl = input.pdfUrl ?? null;
  if (input.repoUrl !== undefined) patch.repoUrl = input.repoUrl ?? null;
  if (input.pdfStoragePath !== undefined) patch.pdfStoragePath = input.pdfStoragePath ?? null;

  const [row] = await db.update(papers).set(patch).where(eq(papers.id, id)).returning();
  return row ?? null;
}

export async function updatePdfStoragePath(
  id: string,
  storagePath: string,
): Promise<PaperRow | null> {
  const [row] = await db
    .update(papers)
    .set({ pdfStoragePath: storagePath, updatedAt: new Date().toISOString() })
    .where(eq(papers.id, id))
    .returning();
  return row ?? null;
}

export async function deletePaper(id: string): Promise<boolean> {
  const result = await db.delete(papers).where(eq(papers.id, id)).returning({ id: papers.id });
  return result.length > 0;
}

export async function upsertAnalysis(paperId: string, input: UpsertAnalysisInput) {
  const existing = await getAnalysisByPaperId(paperId);
  const nowIso = new Date().toISOString();
  if (existing) {
    const [row] = await db
      .update(paperAnalysis)
      .set({
        taskDefinition: input.taskDefinition ?? null,
        researchQuestions: input.researchQuestions ?? null,
        methodOverview: input.methodOverview ?? null,
        metrics: input.metrics ?? null,
        conclusion: input.conclusion ?? null,
        notes: input.notes ?? null,
        updatedAt: nowIso,
      })
      .where(eq(paperAnalysis.paperId, paperId))
      .returning();
    return row ?? null;
  }
  const [row] = await db
    .insert(paperAnalysis)
    .values({
      paperId,
      taskDefinition: input.taskDefinition ?? null,
      researchQuestions: input.researchQuestions ?? null,
      methodOverview: input.methodOverview ?? null,
      metrics: input.metrics ?? null,
      conclusion: input.conclusion ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return row ?? null;
}
