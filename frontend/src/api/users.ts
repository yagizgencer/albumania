import { apiClient } from "./client";

export type ProfileVisibility = "public" | "private";

export interface UserProfile {
  username: string;
  email: string;
  email_verified: boolean;
  display_name: string;
  description: string | null;
  profile_visibility: ProfileVisibility;
  profile_picture_url: string | null;
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

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<UserProfile>("/users/me/avatar", form);
  return data;
}

export async function deleteAvatar(): Promise<void> {
  await apiClient.delete("/users/me/avatar");
}
