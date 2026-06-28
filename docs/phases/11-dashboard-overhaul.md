# Phase 11 — Dashboard table, plot & navigation overhaul

Polished the solo and friend dashboards: fixed/standardized the Album column and
table alignment, made the plot zoomable + click-through + adaptive to large
datasets and reactive to table sorting, replaced the metric control with a flip
switch, removed the Trend toggle, and made dashboard view state survive
navigating into an album and back.

## Library choice
- **`chartjs-plugin-zoom` (2.2.0)** added for x-axis wheel/drag zoom + pan, with a
  "Fit" button to reset. Alternative considered: a hand-rolled wheel/drag x-scale
  transform — rejected as reinventing a maintained plugin. Pinch-zoom (which needs
  hammerjs) is intentionally skipped to avoid an extra dependency.

## Files touched

### New
- `src/lib/usePersistentState.ts` — `useState` backed by `sessionStorage`, re-reads
  on key change; used to persist dashboard view state across navigation.
- `src/components/DashboardChart.tsx` — shared Line chart: hidden x-axis labels,
  adaptive point radius (3→0 as the dataset grows), `nearest` hover/click,
  zoom/pan + Fit, click-a-point → `onPointClick(index)`, `resetKey` resets zoom.
- `src/components/MetricSwitch.tsx` — two-state flip switch (both labels shown,
  one click flips); replaces the old segmented Metric buttons.

### Changed
- `src/pages/ProfileDashboardPage.module.css` (shared) — `.tableWrap` horizontal
  scroll (border/radius moved here), `.numCell { width: 1% }` so numeric columns
  shrink and headers sit above values, header `vertical-align: bottom`,
  `.albumCell { min-width: 180px }`, wider `.chartCard` horizontal padding,
  `.chartToolbar`/`.fitBtn`, and `.switch`/`.switchOption`/`.switchActive`.
- `src/pages/ProfileDashboardPage.tsx` — chart data built from `sorted` (follows
  table sort); removed Trend/cumulative; uses `MetricSwitch`, `DashboardChart`,
  and `usePersistentState` (sort/metric/filters keyed `dash:solo:${username}`);
  table wrapped in `.tableWrap`; chart point click → album board.
- `src/pages/FriendDashboardPage.tsx` — same treatment, **plus** the Album cell
  now uses the standardized `.albumCell`/`.albumText` structure (was raw
  img+`<br>`) with thumbnail → `/albums/:id`; `Released` uses `slice(0,10)`;
  state keyed `dash:pair:${friendshipId}`.
- `src/pages/ProfilePage.tsx` — `compareFriendshipId` now via `usePersistentState`
  keyed by username; removed the unconditional reset so returning from a friend
  album re-opens that friend's dashboard.
- `src/pages/FriendAlbumDetailPage.tsx` — "Back to pair dashboard" → "Back to dashboard".
- `package.json` — added `chartjs-plugin-zoom`.

## Verification
- `pnpm install && pnpm tsc --noEmit && pnpm exec vitest run && pnpm build` — all green.
- Manual checklist in the plan: friend Album column tidy + aligned, no x labels,
  wheel/drag zoom + Fit, hover/click point → album board, sort re-orders plot &
  resets zoom, Metric flip switch only (no Trend), state preserved on Back, and
  the plot stays readable with many albums.
