import { cachedFetch } from "./cache";
import { apiClient } from "./client";

export interface ArtistSearchResult {
  spotify_id: string;
  name: string;
  image_url: string | null;
}

export async function searchArtists(
  q: string,
  limit = 10
): Promise<ArtistSearchResult[]> {
  const { data } = await apiClient.get<ArtistSearchResult[]>("/artists/search", {
    params: { q, limit },
  });
  return data;
}

export type AlbumStatus = "none" | "draft" | "published";

export interface Artist {
  spotify_id: string;
  name: string;
  image_url: string | null;
}

export interface ArtistAlbum {
  spotify_id: string;
  title: string;
  artist: string;
  artist_spotify_id: string | null;
  release_date: string;
  total_songs: number;
  album_art_url: string | null;
  status: AlbumStatus;
  mean_score: number | null;
  num_raters: number;
}

export interface ArtistDetail {
  artist: Artist;
  albums: ArtistAlbum[];
}

export async function getArtist(artistId: string): Promise<ArtistDetail> {
  // The slowest endpoint in the app: uncached it's a Spotify header fetch plus a
  // paginated discography. Caching it here means going back to an artist you
  // just viewed doesn't touch the network at all.
  return cachedFetch(`artist:${artistId}`, async () => {
    const { data } = await apiClient.get<ArtistDetail>(`/artists/${artistId}`);
    return data;
  });
}
