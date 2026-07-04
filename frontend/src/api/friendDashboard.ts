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
  // null for an ad-hoc comparison between two non-friends (computed live).
  friendship_id: number | null;
  user_a_username: string;
  user_b_username: string;
  entries: FriendDashboardEntry[];
}

/** Where a pair comparison's data comes from: a friendship (precomputed) or an
 *  arbitrary viewable user (computed live). Drives the fetch, the persisted-state
 *  namespace, and the per-album detail link. */
export type ComparisonSource =
  | { kind: "friendship"; friendshipId: number }
  | { kind: "user"; username: string };

export function fetchComparison(
  source: ComparisonSource
): Promise<FriendDashboardResponse> {
  return source.kind === "friendship"
    ? getFriendDashboard(source.friendshipId)
    : getUserComparison(source.username);
}

export async function getFriendDashboard(
  friendshipId: number
): Promise<FriendDashboardResponse> {
  const { data } = await apiClient.get<FriendDashboardResponse>(
    `/friendships/${friendshipId}/dashboard`
  );
  return data;
}

/** Live pair comparison with any viewable (non-friend) user. Same shape as the
 *  friend dashboard, but computed on the fly server-side (friendship_id === null). */
export async function getUserComparison(
  username: string
): Promise<FriendDashboardResponse> {
  const { data } = await apiClient.get<FriendDashboardResponse>(
    `/users/${encodeURIComponent(username)}/comparison`
  );
  return data;
}
