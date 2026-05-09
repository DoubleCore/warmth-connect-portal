import { z } from "zod";

export const deviceStatusEnum = z.enum(["idle", "running", "offline", "error"]);
export type DeviceStatus = z.infer<typeof deviceStatusEnum>;

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1),
  deviceType: z.string().nullish(),
  status: deviceStatusEnum.default("idle"),
  location: z.string().nullish(),
  description: z.string().nullish(),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = createDeviceSchema.partial();
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export type DeviceDto = {
  id: string;
  name: string;
  deviceType: string | null;
  status: DeviceStatus;
  location: string | null;
  description: string | null;
};
