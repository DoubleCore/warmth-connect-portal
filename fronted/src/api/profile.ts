import { apiFetch } from "@/lib/api-client";
import type { Profile, UpdateProfileInput } from "@/types/profile";

export async function getProfile() {
  return apiFetch<Profile>("/api/profile");
}

export async function updateProfile(input: UpdateProfileInput) {
  return apiFetch<Profile>("/api/profile", {
    method: "PUT",
    json: input,
  });
}
