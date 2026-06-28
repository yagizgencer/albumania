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
