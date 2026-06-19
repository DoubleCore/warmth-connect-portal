import { createRouter } from "@/shared/context.js";
import { ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { updateLlmConfigSchema } from "./llm-config.dto.js";
import * as service from "./llm-config.service.js";

export const llmConfigRouter = createRouter();

llmConfigRouter.get("/", async (c) => {
  return ok(c, service.getConfig());
});

llmConfigRouter.put("/", zv("json", updateLlmConfigSchema), async (c) => {
  const body = c.req.valid("json");
  return ok(c, service.updateConfig(body));
});
