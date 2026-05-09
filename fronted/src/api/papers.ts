import { apiFetch, apiUrl } from "@/lib/api-client";
import type { Paginated } from "@/types/api";
import type { PaperDetail, PaperListItem, PaperListQuery } from "@/types/paper";

export async function listPapers(query: PaperListQuery = {}): Promise<Paginated<PaperListItem>> {
  return apiFetch<Paginated<PaperListItem>>("/api/papers", { query });
}

export async function getPaperDetail(paperId: string): Promise<PaperDetail> {
  return apiFetch<PaperDetail>(`/api/papers/${encodeURIComponent(paperId)}/detail`);
}

/** Absolute URL for the browser to hit directly (download / 302 redirect). */
export function getPaperPdfUrl(paperId: string): string {
  return apiUrl(`/api/papers/${encodeURIComponent(paperId)}/pdf`);
}
