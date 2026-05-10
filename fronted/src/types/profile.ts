export type Profile = {
  username: string | null;
  updatedAt: string;
};

export type UpdateProfileInput = {
  username: string;
};
