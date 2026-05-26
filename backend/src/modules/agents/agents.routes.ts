import { createRouter } from "@/shared/context.js";
import { ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";

import { testAgentInputSchema, updateAgentInputSchema } from "./agents.dto.js";
import * as service from "./agents.service.js";

export const agentsRouter = createRouter();

agentsRouter.get("/", async (c) => {
  const items = await service.listAgents();
  return ok(c, items);
});

agentsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const agent = await service.getAgent(id);
  return ok(c, agent);
});

agentsRouter.put("/:id", zv("json", updateAgentInputSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const agent = await service.updateAgent(id, body);
  return ok(c, agent);
});

agentsRouter.post("/:id/test", zv("json", testAgentInputSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const result = await service.testAgent(id, body);
  return ok(c, result);
});
