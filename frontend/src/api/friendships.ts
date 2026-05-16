import { apiClient } from "./client";

export type FriendshipStatus = "pending" | "accepted";

export interface Friendship {
  id: number;
  user_a_username: string;
  user_b_username: string;
  status: FriendshipStatus;
  requested_by: string;
  created_at: string;
  accepted_at: string | null;
}

export interface FriendshipList {
  incoming: Friendship[];
  outgoing: Friendship[];
  accepted: Friendship[];
}

export interface UserSearchResult {
  username: string;
  display_name: string;
}

export async function listFriendships(): Promise<FriendshipList> {
  const { data } = await apiClient.get<FriendshipList>("/friendships/me");
  return data;
}

export async function sendFriendRequest(username: string): Promise<Friendship> {
  const { data } = await apiClient.post<Friendship>("/friendships", { username });
  return data;
}

export async function acceptFriendship(id: number): Promise<Friendship> {
  const { data } = await apiClient.post<Friendship>(`/friendships/${id}/accept`);
  return data;
}

export async function declineFriendship(id: number): Promise<void> {
  await apiClient.post(`/friendships/${id}/decline`);
}

export async function deleteFriendship(id: number): Promise<void> {
  await apiClient.delete(`/friendships/${id}`);
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  const { data } = await apiClient.get<UserSearchResult[]>("/users/search", {
    params: { q },
  });
  return data;
}
