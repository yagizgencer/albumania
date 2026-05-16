import { apiClient } from "./client";
import type { DashboardAlbum } from "./dashboard";

export interface FriendDashboardEntry {
  album: DashboardAlbum;
  mutual_date: string;
  similarity_users: number | null;
  similarity_a_vs_spotify: number | null;
  similarity_b_vs_spotify: number | null;
  spotify_top5_indices: number[];
  user_a_top_track_indices: number[];
  user_b_top_track_indices: number[];
  mean_score: number;
  user_a_score: number;
  user_b_score: number;
}

export interface FriendDashboardResponse {
  friendship_id: number;
  user_a_username: string;
  user_b_username: string;
  entries: FriendDashboardEntry[];
}

export async function getFriendDashboard(
  friendshipId: number
): Promise<FriendDashboardResponse> {
  const { data } = await apiClient.get<FriendDashboardResponse>(
    `/friendships/${friendshipId}/dashboard`
  );
  return data;
}
