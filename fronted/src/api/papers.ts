import { ApiError, apiFetch, apiUrl } from "@/lib/api-client";
import type { Paginated } from "@/types/api";
import type { PaperAnalysis, PaperDetail, PaperListItem, PaperListQuery } from "@/types/paper";

export async function listPapers(query: PaperListQuery = {}): Promise<Paginated<PaperListItem>> {
  return apiFetch<Paginated<PaperListItem>>("/api/papers", { query });
}

export async function getPaperDetail(paperId: string): Promise<PaperDetail> {
  return apiFetch<PaperDetail>(`/api/papers/${encodeURIComponent(paperId)}/detail`);
}

/**
 * 触发 FastClaw paperanalyse agent 生成结构化分析卡（写入 paper_analysis 表）。
 * 对应后端 POST /api/papers/:id/analyze。耗时较长（agent 推理），调用方应显示 loading。
 */
export async function analyzePaper(paperId: string): Promise<PaperAnalysis> {
  const res = await apiFetch<{ analysis: PaperAnalysis }>(
    `/api/papers/${encodeURIComponent(paperId)}/analyze`,
    { method: "POST" },
  );
  return res.analysis;
}

/** Partially update a paper's metadata. */
export async function updatePaper(
  paperId: string,
  input: Partial<Omit<PaperListItem, "id">> & {
    abstract?: string | null;
    pdfStoragePath?: string | null;
  },
): Promise<PaperListItem> {
  return apiFetch<PaperListItem>(`/api/papers/${encodeURIComponent(paperId)}`, {
    method: "PATCH",
    json: input,
  });
}

/** Delete a paper and all its cascaded data (analysis, reproduction records, etc.). */
export async function deletePaper(paperId: string): Promise<void> {
  return apiFetch<void>(`/api/papers/${encodeURIComponent(paperId)}`, {
    method: "DELETE",
  });
}

/**
 * Upload a local PDF file for the given paper. Uses `fetch` directly because
 * the apiFetch helper always JSON-encodes bodies.
 */
export async function uploadPaperPdf(paperId: string, file: File): Promise<PaperListItem> {
  const form = new FormData();
  form.append("file", file);
  const url = apiUrl(`/api/papers/${encodeURIComponent(paperId)}/pdf`);
  const res = await fetch(url, { method: "POST", body: form });
  // Reuse apiFetch's envelope logic by reading the JSON body here.
  const json = (await res.json()) as
    | { success: true; data: PaperListItem }
    | {
        success: false;
        error: { code: string; message: string; details?: unknown; requestId?: string };
      };
  if (!json.success) {
    throw new ApiError(
      res.status,
      json.error.code,
      json.error.message,
      json.error.details,
      json.error.requestId,
    );
  }
  return json.data;
}

/** Absolute URL for the browser to hit directly (download / 302 redirect). */
export function getPaperPdfUrl(paperId: string): string {
  return apiUrl(`/api/papers/${encodeURIComponent(paperId)}/pdf`);
}
