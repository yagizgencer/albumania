import { apiClient } from "./client";

export interface DashboardAlbum {
  id: number;
  spotify_id: string;
  title: string;
  artist: string;
  artist_spotify_id: string | null;
  release_date: string;
  total_songs: number;
  album_art_url: string | null;
}

export interface DashboardEntry {
  album: DashboardAlbum;
  score: number;
  top_track_indices: number[];
  spotify_top5_indices: number[];
  similarity_user_vs_spotify: number | null;
  completed_at: string;
}

export interface DashboardResponse {
  username: string;
  entries: DashboardEntry[];
}

export async function getDashboard(username: string): Promise<DashboardResponse> {
  const { data } = await apiClient.get<DashboardResponse>(
    `/users/${username}/dashboard`,
    { params: { compare_to: "spotify" } }
  );
  return data;
}
