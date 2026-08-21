import { apiClient } from "./client";

export interface Features {
  /** "Your top 5 vs Spotify's most popular" on the dashboards. */
  spotifyComparison: boolean;
}

/** Safe default: assume off. Better to hide a working feature for a moment
 *  than to render comparison UI that has no data behind it. */
export const FEATURES_DEFAULT: Features = { spotifyComparison: false };

export async function getFeatures(): Promise<Features> {
  const { data } = await apiClient.get<{ spotify_comparison: boolean }>("/features");
  return { spotifyComparison: data.spotify_comparison };
}
