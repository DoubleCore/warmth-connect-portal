import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { createDeviceSchema, updateDeviceSchema } from "./devices.dto.js";
import * as service from "./devices.service.js";

export const devicesRouter = createRouter();

devicesRouter.get("/", async (c) => {
  const result = await service.listDevices();
  return ok(c, result);
});

devicesRouter.post("/", zv("json", createDeviceSchema), async (c) => {
  const body = c.req.valid("json");
  const device = await service.createDevice(body);
  return created(c, device);
});

devicesRouter.patch("/:deviceId", zv("json", updateDeviceSchema), async (c) => {
  const id = c.req.param("deviceId");
  const body = c.req.valid("json");
  const device = await service.updateDevice(id, body);
  return ok(c, device);
});

devicesRouter.delete("/:deviceId", async (c) => {
  const id = c.req.param("deviceId");
  await service.deleteDevice(id);
  return c.body(null, 204);
});
