import { createRouter } from "@/shared/context.js";
import { ok } from "@/shared/response.js";
import { zv } from "@/shared/validator.js";
import { updateProfileSchema } from "./profile.dto.js";
import * as service from "./profile.service.js";

export const profileRouter = createRouter();

profileRouter.get("/", async (c) => {
  const profile = await service.getProfile();
  return ok(c, profile);
});

profileRouter.put("/", zv("json", updateProfileSchema), async (c) => {
  const body = c.req.valid("json");
  const profile = await service.updateProfile(body);
  return ok(c, profile);
});
