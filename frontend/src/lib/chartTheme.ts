import { Chart as ChartJS } from "chart.js";

/**
 * Theme-aware Chart.js defaults for the Warm Peach Pro look.
 *
 * `applyChartTheme()` reads ink/grid colors from the live CSS custom properties
 * on <html>, so charts follow light/dark. ThemeContext calls it on every theme
 * change; we also call it once at module load for the initial paint. Per-dataset
 * colors come from `chartPalette` / `chartFill` below (the warm accent hues).
 */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function applyChartTheme(): void {
  const ink = cssVar("--text", "#2e2620");
  // Faint grid tuned to the current ink; use a translucent ink so it works on
  // both light and dark paper.
  const grid = cssVar("--paper-dot", "rgba(46,38,32,0.08)");

  ChartJS.defaults.font.family =
    '"Comic Neue", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ChartJS.defaults.font.size = 13;
  ChartJS.defaults.color = ink;
  ChartJS.defaults.borderColor = grid;
}

// Initial application (ThemeContext re-applies on theme change).
applyChartTheme();

/** Solid line/point colors — the Warm Peach accent family + friends.
 *  (lavender/mint/sky/peach are back-compat aliases used by the dashboards until
 *  the M2 dashboard sweep repoints them to coral/teal/amber.) */
export const chartPalette = {
  coral: "#f2a6a0",
  teal: "#4fb8a4",
  amber: "#f0c66a",
  terracotta: "#d47a52",
  olive: "#8a9a52",
  ink: "#2e2620",
  lavender: "#d47a52",
  mint: "#4fb8a4",
  sky: "#8a9a52",
  peach: "#f0c66a",
} as const;

/** Translucent fills to pair with the stroke colors above. */
export const chartFill = {
  coral: "rgba(242, 166, 160, 0.22)",
  teal: "rgba(79, 184, 164, 0.22)",
  amber: "rgba(240, 198, 106, 0.22)",
  terracotta: "rgba(212, 122, 82, 0.22)",
  lavender: "rgba(212, 122, 82, 0.22)",
  mint: "rgba(79, 184, 164, 0.22)",
  sky: "rgba(138, 154, 82, 0.22)",
} as const;
