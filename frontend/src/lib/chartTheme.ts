import { Chart as ChartJS } from "chart.js";

/**
 * Cozy pastel theme for every Chart.js chart in the app.
 *
 * Import this module once (in main.tsx) to apply global defaults: the Nunito
 * body font, warm-ink text, and faint grid lines. Charts then read as part of
 * the same sketchbook palette as the rest of the UI. Per-dataset colors come
 * from `chartPalette` below.
 */
const INK = "#3a322a";
const INK_FAINT = "rgba(58, 50, 42, 0.12)";

ChartJS.defaults.font.family =
  '"Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
ChartJS.defaults.font.size = 13;
ChartJS.defaults.color = INK;
ChartJS.defaults.borderColor = INK_FAINT;

/** Solid pastel line/point colors (readable as strokes on cream). */
export const chartPalette = {
  lavender: "#8a78dd",
  coral: "#ff7a7a",
  mint: "#4fb56a",
  sky: "#3f9aa6",
  peach: "#e89a4a",
  ink: INK,
} as const;

/** Translucent fills to pair with the stroke colors above. */
export const chartFill = {
  lavender: "rgba(138, 120, 221, 0.18)",
  coral: "rgba(255, 122, 122, 0.18)",
  mint: "rgba(79, 181, 106, 0.18)",
  sky: "rgba(63, 154, 166, 0.18)",
} as const;
