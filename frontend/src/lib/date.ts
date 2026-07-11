/**
 * Format a date string as DD.MM.YYYY for display across the app.
 *
 * Accepts ISO dates/timestamps ("2026-06-28", "2026-06-28T12:00:00Z") and
 * Spotify's partial release dates ("2026", "2026-06"). Falls back gracefully:
 * year-month → "MM.YYYY", year-only → "YYYY".
 */
export function formatDate(value: string): string {
  if (!value) return "";
  const [y, m, d] = value.split("T")[0].split("-");
  if (d) return `${d}.${m}.${y}`;
  if (m) return `${m}.${y}`;
  return y;
}

/** Today as an ISO "YYYY-MM-DD" string (local time). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
