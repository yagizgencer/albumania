import { apiClient } from "./client";

export interface AlbumSearchResult {
  spotify_id: string;
  title: string;
  artist: string;
  release_date: string;
  total_songs: number;
  album_art_url: string | null;
}

export interface AlbumTrack {
  index: number;
  name: string;
  spotify_url: string | null;
}

export interface Album {
  id: number;
  spotify_id: string;
  title: string;
  artist: string;
  release_date: string;
  total_songs: number;
  album_art_url: string | null;
  tracks: AlbumTrack[];
}

export async function searchAlbums(
  q: string,
  limit = 10
): Promise<AlbumSearchResult[]> {
  const { data } = await apiClient.get<AlbumSearchResult[]>("/albums/search", {
    params: { q, limit },
  });
  return data;
}

export async function getAlbum(spotifyId: string): Promise<Album> {
  const { data } = await apiClient.get<Album>(`/albums/${spotifyId}`);
  return data;
}
