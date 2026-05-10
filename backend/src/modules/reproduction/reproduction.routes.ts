import { createRouter } from "@/shared/context.js";
import { created, ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { createReproductionSchema, updateReproductionSchema } from "./reproduction.dto.js";
import * as service from "./reproduction.service.js";

export const reproductionRouter = createRouter();

reproductionRouter.get("/", async (c) => {
  const result = await service.listRecords();
  return ok(c, result);
});

reproductionRouter.post("/", zv("json", createReproductionSchema), async (c) => {
  const body = c.req.valid("json");
  const record = await service.createRecord(body);
  return created(c, record);
});

reproductionRouter.patch("/:recordId", zv("json", updateReproductionSchema), async (c) => {
  const id = c.req.param("recordId");
  const body = c.req.valid("json");
  const record = await service.updateRecord(id, body);
  return ok(c, record);
});

reproductionRouter.delete("/:recordId", async (c) => {
  const id = c.req.param("recordId");
  await service.deleteRecord(id);
  return c.body(null, 204);
});
