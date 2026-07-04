import type { ComparisonSource } from "../api/friendDashboard";

/**
 * The "Compare with" selection on a profile dashboard is persisted per profile
 * (see ProfilePage). These helpers keep the storage key in one place so other
 * pages can pre-seed which comparison a profile should open with — e.g. the
 * album / comparison detail pages, whose "Back to dashboard" jumps to a
 * profile with the right comparison already selected.
 *
 * The persisted value is a ComparisonSource (a friendship id, or a username for
 * a non-friend live comparison) or null (the solo vs-Spotify dashboard).
 */

export function compareStorageKey(username: string): string {
  return `dash:compare:${username}`;
}

/**
 * Seed a profile's "Compare with" selection before navigating to it. `null`
 * means "just Spotify" (the solo dashboard). Mirrors how usePersistentState
 * serialises its value (JSON in sessionStorage).
 */
export function setDashboardCompare(
  username: string,
  source: ComparisonSource | null
): void {
  try {
    sessionStorage.setItem(compareStorageKey(username), JSON.stringify(source));
  } catch {
    // storage unavailable — non-fatal; the dashboard falls back to its default.
  }
}

/**
 * Router state attached when navigating from an album page into a comparison
 * detail view. It tells the detail page's "Back to dashboard" which profile to
 * return to and which comparison to restore (null = Spotify only).
 */
export interface DashboardBackState {
  profile: string;
  compareSource: ComparisonSource | null;
}
