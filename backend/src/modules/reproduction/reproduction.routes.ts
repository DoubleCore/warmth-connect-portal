import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  createReproductionSchema,
  updateReproductionSchema,
} from "./reproduction.dto.js";
import * as service from "./reproduction.service.js";

export const reproductionRouter = new Hono();

reproductionRouter.get("/", async (c) => {
  const result = await service.listRecords();
  return c.json(result);
});

reproductionRouter.post("/", zValidator("json", createReproductionSchema), async (c) => {
  const body = c.req.valid("json");
  const record = await service.createRecord(body);
  return c.json(record, 201);
});

reproductionRouter.patch(
  "/:recordId",
  zValidator("json", updateReproductionSchema),
  async (c) => {
    const id = c.req.param("recordId");
    const body = c.req.valid("json");
    const record = await service.updateRecord(id, body);
    return c.json(record);
  },
);

reproductionRouter.delete("/:recordId", async (c) => {
  const id = c.req.param("recordId");
  await service.deleteRecord(id);
  return c.body(null, 204);
});
