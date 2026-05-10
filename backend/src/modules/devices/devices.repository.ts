import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client.js";
import { devices, type DeviceRow } from "@/db/schema.js";
import type { CreateDeviceInput, UpdateDeviceInput } from "./devices.dto.js";

export async function listDevices(): Promise<DeviceRow[]> {
  return db.select().from(devices).orderBy(desc(devices.createdAt));
}

export async function getDeviceById(id: string): Promise<DeviceRow | null> {
  const rows = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertDevice(input: CreateDeviceInput): Promise<DeviceRow> {
  const [row] = await db
    .insert(devices)
    .values({
      name: input.name,
      deviceType: input.deviceType ?? null,
      status: input.status,
      location: input.location ?? null,
      description: input.description ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert device");
  return row;
}

export async function updateDevice(
  id: string,
  input: UpdateDeviceInput,
): Promise<DeviceRow | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.deviceType !== undefined) patch.deviceType = input.deviceType ?? null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.location !== undefined) patch.location = input.location ?? null;
  if (input.description !== undefined) patch.description = input.description ?? null;

  const [row] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning();
  return row ?? null;
}

export async function deleteDevice(id: string): Promise<boolean> {
  const result = await db.delete(devices).where(eq(devices.id, id)).returning({ id: devices.id });
  return result.length > 0;
}
