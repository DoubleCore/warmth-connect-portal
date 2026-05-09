export type DeviceStatus = "idle" | "running" | "offline" | "error";

export type Device = {
  id: string;
  name: string;
  deviceType: string | null;
  status: DeviceStatus;
  location: string | null;
  description: string | null;
};

export type CreateDeviceInput = {
  name: string;
  deviceType?: string | null;
  status?: DeviceStatus;
  location?: string | null;
  description?: string | null;
};

export type UpdateDeviceInput = Partial<CreateDeviceInput>;
