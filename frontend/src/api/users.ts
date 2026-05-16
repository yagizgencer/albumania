import { apiClient } from "./client";

export type ProfileVisibility = "public" | "private";

export interface UserProfile {
  username: string;
  email: string;
  display_name: string;
  description: string | null;
  profile_visibility: ProfileVisibility;
  created_at: string;
}

export interface UserUpdate {
  display_name?: string;
  description?: string | null;
  profile_visibility?: ProfileVisibility;
}

export async function getUser(username: string): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>(`/users/${username}`);
  return data;
}

export async function updateMe(patch: UserUpdate): Promise<UserProfile> {
  const { data } = await apiClient.patch<UserProfile>("/users/me", patch);
  return data;
}
