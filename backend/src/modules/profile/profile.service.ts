import type { UserProfileRow } from "@/db/schema.js";
import type { ProfileDto, UpdateProfileInput } from "./profile.dto.js";
import * as repo from "./profile.repository.js";

function toDto(row: UserProfileRow | null): ProfileDto {
  if (!row) {
    return { username: null, updatedAt: new Date(0).toISOString() };
  }
  return {
    username: row.username && row.username.length > 0 ? row.username : null,
    updatedAt: row.updatedAt,
  };
}

export async function getProfile(): Promise<ProfileDto> {
  const row = await repo.getProfile();
  return toDto(row);
}

export async function updateProfile(input: UpdateProfileInput): Promise<ProfileDto> {
  const trimmed = input.username.trim();
  const nextUsername = trimmed.length === 0 ? null : trimmed;
  const row = await repo.upsertProfile(nextUsername);
  return toDto(row);
}
