import { apiFetch } from "@/lib/api-client";
import type { CreateDeviceInput, Device, UpdateDeviceInput } from "@/types/device";

export async function listDevices() {
  return apiFetch<{ items: Device[] }>("/api/devices");
}

export async function createDevice(input: CreateDeviceInput) {
  return apiFetch<Device>("/api/devices", { method: "POST", json: input });
}

export async function updateDevice(id: string, input: UpdateDeviceInput) {
  return apiFetch<Device>(`/api/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: input,
  });
}

export async function deleteDevice(id: string) {
  return apiFetch<void>(`/api/devices/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
