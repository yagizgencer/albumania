/**
 * The "Compare with" selection on a profile dashboard is persisted per profile
 * (see ProfilePage). These helpers keep the storage key in one place so other
 * pages can pre-seed which comparison a profile should open with — e.g. the
 * album / friend detail pages, whose "Back to dashboard" jumps to a friend's
 * profile with the right comparison already selected.
 */

export function compareStorageKey(username: string): string {
  return `dash:compare:${username}`;
}

/**
 * Seed a profile's "Compare with" selection before navigating to it.
 * `null` means "just Spotify" (the solo dashboard). Mirrors how
 * usePersistentState serialises its value (JSON in sessionStorage).
 */
export function setDashboardCompare(
  username: string,
  friendshipId: number | null
): void {
  try {
    sessionStorage.setItem(compareStorageKey(username), JSON.stringify(friendshipId));
  } catch {
    // storage unavailable — non-fatal; the dashboard falls back to its default.
  }
}

/**
 * Router state attached when navigating from an album page into a friend detail
 * view. It tells the detail page's "Back to dashboard" which profile to return
 * to and which comparison to restore (null = Spotify only).
 */
export interface DashboardBackState {
  profile: string;
  compareFriendshipId: number | null;
}
