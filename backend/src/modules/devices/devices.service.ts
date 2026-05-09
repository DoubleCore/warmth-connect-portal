import type { DeviceRow } from "@/db/schema.js";
import { NotFoundError } from "@/shared/errors.js";
import type {
  CreateDeviceInput,
  DeviceDto,
  DeviceStatus,
  UpdateDeviceInput,
} from "./devices.dto.js";
import * as repo from "./devices.repository.js";

export function toDto(row: DeviceRow): DeviceDto {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    status: row.status as DeviceStatus,
    location: row.location,
    description: row.description,
  };
}

export async function listDevices(): Promise<{ items: DeviceDto[] }> {
  const rows = await repo.listDevices();
  return { items: rows.map(toDto) };
}

export async function createDevice(input: CreateDeviceInput): Promise<DeviceDto> {
  const row = await repo.insertDevice(input);
  return toDto(row);
}

export async function updateDevice(id: string, input: UpdateDeviceInput): Promise<DeviceDto> {
  const existing = await repo.getDeviceById(id);
  if (!existing) throw new NotFoundError("Device", id);
  const row = await repo.updateDevice(id, input);
  if (!row) throw new NotFoundError("Device", id);
  return toDto(row);
}

export async function deleteDevice(id: string): Promise<void> {
  const ok = await repo.deleteDevice(id);
  if (!ok) throw new NotFoundError("Device", id);
}

export async function getDeviceOrThrow(id: string): Promise<DeviceRow> {
  const row = await repo.getDeviceById(id);
  if (!row) throw new NotFoundError("Device", id);
  return row;
}
