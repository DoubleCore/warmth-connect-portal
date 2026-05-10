import { z } from "zod";

export const updateProfileSchema = z.object({
  // Allow empty string as an explicit "clear the username" signal.
  username: z.string().trim().max(120),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export type ProfileDto = {
  username: string | null;
  updatedAt: string;
};
