import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createDeviceSchema, updateDeviceSchema } from "./devices.dto.js";
import * as service from "./devices.service.js";

export const devicesRouter = new Hono();

devicesRouter.get("/", async (c) => {
  const result = await service.listDevices();
  return c.json(result);
});

devicesRouter.post("/", zValidator("json", createDeviceSchema), async (c) => {
  const body = c.req.valid("json");
  const device = await service.createDevice(body);
  return c.json(device, 201);
});

devicesRouter.patch(
  "/:deviceId",
  zValidator("json", updateDeviceSchema),
  async (c) => {
    const id = c.req.param("deviceId");
    const body = c.req.valid("json");
    const device = await service.updateDevice(id, body);
    return c.json(device);
  },
);

devicesRouter.delete("/:deviceId", async (c) => {
  const id = c.req.param("deviceId");
  await service.deleteDevice(id);
  return c.body(null, 204);
});
