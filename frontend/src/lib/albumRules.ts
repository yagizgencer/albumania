// Only albums with 5–25 tracks can be rated / added to Listen Later / shared —
// we only have ranking baselines for those sizes (see backend seed_baselines.py
// and app/core/album_rules.py).
export const MIN_ALBUM_SONGS = 5;
export const MAX_ALBUM_SONGS = 25;

export function isRateable(totalSongs: number): boolean {
  return totalSongs >= MIN_ALBUM_SONGS && totalSongs <= MAX_ALBUM_SONGS;
}

export const RATEABLE_RULE_TEXT = `Only albums with ${MIN_ALBUM_SONGS}–${MAX_ALBUM_SONGS} tracks can be rated.`;
