import type { PaperRow, PaperAnalysisRow } from "@/db/schema.js";
import type { Logger } from "pino";
import { env } from "@/config/env.js";
import { AppError, NotFoundError } from "@/shared/errors.js";
import { baseLogger } from "@/shared/logger.js";
import { buildPagination, type Paginated } from "@/shared/pagination.js";
import { fastclawClient } from "@/modules/fastclaw/fastclaw.client.js";
import type {
  CreatePaperInput,
  PaperDetailDto,
  PaperListItemDto,
  PaperListQuery,
  UpdatePaperInput,
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
    repoUrl: row.repoUrl,
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

export async function updatePaper(
  paperId: string,
  input: UpdatePaperInput,
): Promise<PaperListItemDto> {
  await getPaperOrThrow(paperId);
  const row = await repo.updatePaper(paperId, input);
  if (!row) throw new NotFoundError("Paper", paperId);
  return toListItem(row);
}

export async function setPdfStoragePath(
  paperId: string,
  storagePath: string,
): Promise<PaperListItemDto> {
  await getPaperOrThrow(paperId);
  const row = await repo.updatePdfStoragePath(paperId, storagePath);
  if (!row) throw new NotFoundError("Paper", paperId);
  return toListItem(row);
}

export async function deletePaper(paperId: string): Promise<void> {
  const ok = await repo.deletePaper(paperId);
  if (!ok) throw new NotFoundError("Paper", paperId);
}

export async function upsertAnalysis(paperId: string, input: UpsertAnalysisInput) {
  await getPaperOrThrow(paperId);
  const row = await repo.upsertAnalysis(paperId, input);
  return toAnalysisDto(row);
}

// ---------- AI 深度分析：调 FastClaw paperanalyse agent ----------

const ANALYSIS_FIELDS = [
  "taskDefinition",
  "researchQuestions",
  "methodOverview",
  "metrics",
  "conclusion",
  "notes",
] as const;

/**
 * 从 agent 回复里抽出 JSON 对象。
 * agent 常把 JSON 包在 ```json ... ``` 代码块里，或在前后加说明文字，
 * 所以先尝试代码块，再退化到“第一个 { 到最后一个 }”。
 */
function extractAnalysisJson(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AppError("Agent 未返回可解析的分析 JSON。", 502, "ANALYSIS_PARSE_FAILED", {
      preview: raw.slice(0, 300),
    });
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new AppError("Agent 返回的分析 JSON 解析失败。", 502, "ANALYSIS_PARSE_FAILED", {
      preview: raw.slice(0, 300),
    });
  }
}

function coerceAnalysis(obj: Record<string, unknown>): UpsertAnalysisInput {
  const out: Record<string, string | null> = {};
  for (const key of ANALYSIS_FIELDS) {
    const v = obj[key];
    out[key] = typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  }
  return out as UpsertAnalysisInput;
}

/**
 * 调 FastClaw paperanalyse agent 生成结构化分析卡，解析后落库。
 *
 * 岗位映射：library 论文详情页的“AI 深度分析”按钮 → 这里 → paperanalyse agent。
 * 设计上区别于 RAG 快问快答（后者走独立 LLM）：这里要的是 agent 的论文分析专长，
 * 产出结构化六字段（taskDefinition / researchQuestions / methodOverview /
 * metrics / conclusion / notes），与 paper_analysis 表一一对应。
 */
export async function analyzePaper(paperId: string, logger: Logger = baseLogger) {
  const paper = await getPaperOrThrow(paperId);

  if (!fastclawClient.isConfigured()) {
    throw new AppError(
      "FastClaw 未配置，无法生成 AI 分析。请检查 FASTCLAW_BASE_URL。",
      503,
      "FASTCLAW_NOT_CONFIGURED",
    );
  }
  const agentId = env.FASTCLAW_AGENT_PAPER_ANALYSE ?? env.FASTCLAW_AGENT_ID;
  if (!agentId) {
    throw new AppError(
      "论文分析 Agent 未配置（FASTCLAW_AGENT_PAPER_ANALYSE）。",
      503,
      "FASTCLAW_AGENT_NOT_CONFIGURED",
    );
  }

  const authors = parseAuthors(paper.authorsJson);
  const systemPrompt =
    "你是论文分析专家。根据用户提供的论文标题、作者、摘要，输出一张结构化分析卡。" +
    "必须只返回一个 JSON 对象，不要任何额外文字、不要 Markdown 代码块、不要写入任何外部系统。" +
    "JSON 字段（值均为字符串，用中文填写；信息不足的字段填空字符串）：" +
    "taskDefinition（任务定义）、researchQuestions（研究问题）、methodOverview（方法概述）、" +
    "metrics（评测指标）、conclusion（结论）、notes（补充说明，含已知局限）。";

  const userPrompt = `请分析以下论文并仅返回 JSON：

标题：${paper.title}
作者：${authors.length > 0 ? authors.join(", ") : "未知"}
${paper.field ? `领域：${paper.field}\n` : ""}${paper.source ? `来源：${paper.source}\n` : ""}摘要：
${paper.abstract ?? "（无摘要）"}`;

  logger.info({ paperId, agentId }, "Calling paperanalyse agent for paper analysis");

  const result = await fastclawClient.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    logger,
    { agentId, temperature: 0.2, sessionKey: `paper-analyze-${paperId}` },
  );

  const parsed = coerceAnalysis(extractAnalysisJson(result.content));
  const row = await repo.upsertAnalysis(paperId, parsed);
  logger.info({ paperId }, "Paper analysis generated and saved");
  return toAnalysisDto(row);
}
