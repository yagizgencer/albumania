import { apiClient } from "./client";

export interface SongNote {
  track_index: number;
  note_text: string;
}

export interface Rating {
  id: number;
  username: string;
  album_id: number;
  score: number | null;
  // Up to 5 entries; `null` slots preserve UI position for in-progress drafts.
  top_track_indices: (number | null)[] | null;
  status: "draft" | "published";
  started_at: string;
  completed_at: string | null;
  last_edited_at: string;
  notes: SongNote[];
}

export async function createRating(albumId: number): Promise<Rating> {
  const { data } = await apiClient.post<Rating>("/ratings", { album_id: albumId });
  return data;
}

export async function listMyRatings(): Promise<Rating[]> {
  const { data } = await apiClient.get<Rating[]>("/ratings/me");
  return data;
}

export async function getMyRatingForAlbum(albumId: number): Promise<Rating> {
  const { data } = await apiClient.get<Rating>(`/ratings/me/${albumId}`);
  return data;
}

export interface RatingPatch {
  score?: number | null;
  top_track_indices?: (number | null)[];
  notes?: Record<number, string>;
}

export async function patchRating(ratingId: number, patch: RatingPatch): Promise<Rating> {
  const { data } = await apiClient.patch<Rating>(`/ratings/${ratingId}`, patch);
  return data;
}

export async function publishRating(ratingId: number): Promise<Rating> {
  const { data } = await apiClient.post<Rating>(`/ratings/${ratingId}/publish`);
  return data;
}

export async function deleteRating(ratingId: number): Promise<void> {
  await apiClient.delete(`/ratings/${ratingId}`);
}
