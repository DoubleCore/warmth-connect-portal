import { NotFoundError, ValidationError } from "@/shared/errors.js";
import * as papersService from "@/modules/papers/papers.service.js";
import * as devicesService from "@/modules/devices/devices.service.js";
import type {
  CreateReproductionInput,
  ReproductionRecordDto,
  ReproductionStatus,
  UpdateReproductionInput,
} from "./reproduction.dto.js";
import * as repo from "./reproduction.repository.js";
import type { ReproductionJoinedRow } from "./reproduction.repository.js";

function toDto(row: ReproductionJoinedRow): ReproductionRecordDto {
  const r = row.record;
  return {
    id: r.id,
    paper: row.paper ?? { id: r.paperId, title: "(missing paper)" },
    device: row.device,
    status: r.status as ReproductionStatus,
    progress: r.progress,
    resultSummary: r.resultSummary,
    artifactUrl: r.artifactUrl,
    trainingNotes: r.trainingNotes,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

export async function listRecords(): Promise<{ items: ReproductionRecordDto[] }> {
  const rows = await repo.listRecords();
  return { items: rows.map(toDto) };
}

async function validateReferences(paperId: string | undefined, deviceId: string | null | undefined) {
  if (paperId) await papersService.getPaperOrThrow(paperId);
  if (deviceId) await devicesService.getDeviceOrThrow(deviceId);
}

export async function createRecord(input: CreateReproductionInput): Promise<ReproductionRecordDto> {
  await validateReferences(input.paperId, input.deviceId ?? null);
  const row = await repo.insertRecord(input);
  const joined = await repo.getRecordById(row.id);
  if (!joined) throw new Error("Failed to load created reproduction record");
  return toDto(joined);
}

export async function updateRecord(
  id: string,
  input: UpdateReproductionInput,
): Promise<ReproductionRecordDto> {
  const existing = await repo.getRecordById(id);
  if (!existing) throw new NotFoundError("ReproductionRecord", id);

  // progress vs status sanity check
  if (input.progress !== undefined && (input.progress < 0 || input.progress > 100)) {
    throw new ValidationError("progress must be between 0 and 100");
  }
  if (input.deviceId !== undefined) {
    await validateReferences(undefined, input.deviceId ?? null);
  }

  const updated = await repo.updateRecord(id, input);
  if (!updated) throw new NotFoundError("ReproductionRecord", id);
  const joined = await repo.getRecordById(id);
  if (!joined) throw new NotFoundError("ReproductionRecord", id);
  return toDto(joined);
}

export async function deleteRecord(id: string): Promise<void> {
  const ok = await repo.deleteRecord(id);
  if (!ok) throw new NotFoundError("ReproductionRecord", id);
}
