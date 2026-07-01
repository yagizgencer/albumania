import { apiClient } from "./client";

export type FeedType =
  | "you_rated"
  | "friend_rated"
  | "you_commented"
  | "friend_commented"
  | "new_friend";

/** Filterable activity categories — each maps to one or two raw FeedTypes. */
export type FeedCategory = "ratings" | "comments" | "friends";

export type TrendingPeriod = "week" | "month" | "year" | "all";

export interface FeedActor {
  username: string;
  display_name: string;
  picture_url: string | null;
}

export interface FeedAlbum {
  spotify_id: string;
  title: string;
  artist: string;
  album_art_url: string | null;
}

export interface FeedItem {
  id: string;
  type: FeedType;
  created_at: string;
  actor: FeedActor;
  album: FeedAlbum | null;
  score: number | null;
  excerpt: string | null;
}

export interface FeedPage {
  items: FeedItem[];
  next_before: string | null;
}

export interface TrendingAlbum {
  rank: number;
  spotify_id: string;
  title: string;
  artist: string;
  artist_spotify_id: string | null;
  album_art_url: string | null;
  rating_count: number;
  mean_score: number | null;
  num_raters: number;
}

export interface TrendingArtist {
  rank: number;
  artist_spotify_id: string;
  name: string;
  image_url: string | null;
  rating_count: number;
}

export async function getFeed(
  before?: string | null,
  limit = 20,
  types?: FeedCategory[],
): Promise<FeedPage> {
  const params: Record<string, string | number | string[]> = { limit };
  if (before) params.before = before;
  // Only send `types` when narrowing to a subset; omit it to get every category.
  if (types && types.length > 0) params.types = types;
  const { data } = await apiClient.get<FeedPage>("/home/feed", { params });
  return data;
}

export async function getTrendingAlbums(period: TrendingPeriod): Promise<TrendingAlbum[]> {
  const { data } = await apiClient.get<TrendingAlbum[]>("/trending/albums", {
    params: { period },
  });
  return data;
}

export async function getTrendingArtists(period: TrendingPeriod): Promise<TrendingArtist[]> {
  const { data } = await apiClient.get<TrendingArtist[]>("/trending/artists", {
    params: { period },
  });
  return data;
}
