import { apiFetch } from "@/lib/api-client";
import type {
  CreateReproductionInput,
  ReproductionRecord,
  UpdateReproductionInput,
} from "@/types/reproduction";

export async function listReproductionRecords() {
  return apiFetch<{ items: ReproductionRecord[] }>("/api/reproduction-records");
}

export async function createReproductionRecord(input: CreateReproductionInput) {
  return apiFetch<ReproductionRecord>("/api/reproduction-records", {
    method: "POST",
    json: input,
  });
}

export async function updateReproductionRecord(id: string, input: UpdateReproductionInput) {
  return apiFetch<ReproductionRecord>(`/api/reproduction-records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: input,
  });
}

export async function deleteReproductionRecord(id: string) {
  return apiFetch<void>(`/api/reproduction-records/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
