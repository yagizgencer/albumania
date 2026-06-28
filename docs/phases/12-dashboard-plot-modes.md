# Phase 12 — Dashboard plot modes, table fit & global date format

Replaced the brittle chart zoom with two explicit, robust view modes; made the
dashboard tables fit the page with no horizontal scroll; and standardized all
date displays to `DD.MM.YYYY`.

## Approach / choice
- **Dropped `chartjs-plugin-zoom`** (it shifted the whole plot on small zooms).
  The plot is a **fixed-size canvas that windows the x-range** via `scales.x.min/max`
  (with a fixed global `y.min/max` so y never rescales). This keeps the **y-axis and
  legend always in view** — only the visible x-window scrolls/zooms — and is fully
  controllable. Panning = a range scrollbar + drag + wheel; zoom (overview) =
  changing the window size. Alternative considered (and initially built): a wide
  overflow-scrolled canvas — rejected because the y-axis/legend scrolled out of view.
- **Two modes:** **Detailed** (default) — ~10 diagonal album-name x labels, y fully
  fitted, scrollbar/drag/wheel to move the window. **Overview** — labels hidden,
  fit-all by default, zoom in/out/pan via a subtle toolbox plus free mouse (cursor-
  anchored wheel zoom, drag-to-pan). The **Detailed/Overview toggle is a `MetricSwitch`
  in the controls row** (matching the Metric switch), not inside the chart.
- Tables use the **widened profile layout** (max-width 1320px), a slimmer 18% Album
  column, and **stacked similarity headers** (`userA / ↔ / userB`) truncated to
  ~username length with a `title` tooltip, so the fixed columns fit without scrolling.

## Files touched

### New
- `src/lib/date.ts` — `formatDate()` → `DD.MM.YYYY` (handles ISO timestamps and
  Spotify partial dates: year-month → `MM.YYYY`, year → `YYYY`).

### Chart
- `src/components/DashboardChart.tsx` — full rewrite: mode toggle + zoom toolbox
  header, measured scroll area + width sizer, adaptive point radius, cursor-anchored
  wheel zoom (overview) / wheel-scroll (detailed), drag-to-pan with click
  suppression, click-a-point → navigate; zoom resets on mode/sort change. Registers
  core chart.js components (no zoom plugin).
- `src/pages/ProfileDashboardPage.module.css` (shared) — `.chartHeader`,
  `.toolbox`/`.toolBtn`, `.scrollArea`/`.sizer`; table switched to
  `table-layout: fixed` with a 26% Album column (numeric columns auto-share),
  wrapping/`overflow-wrap` headers, tighter padding; **removed** the horizontal
  scroll + `numCell { width:1% }`.

### Dashboards
- `src/pages/ProfileDashboardPage.tsx`, `src/pages/FriendDashboardPage.tsx` —
  persist `view` (`usePersistentState`), pass `view`/`onViewChange`/`sortKey` to
  `DashboardChart`; friend headers truncate long usernames via `trunc()` + `title=`
  (a new optional `title` prop on the header). Date cells use `formatDate`.

### Date format applied
- `src/pages/{HomePage,ProfilePage,AlbumDetailPage,FriendAlbumDetailPage,AlbumInfoPage}.tsx`
  — full-date displays now use `formatDate`. Year-only displays (RatingEditor,
  ListenLater, AlbumSearchBar) and internal filter date-math left as-is.

### Dependency
- `package.json` — removed `chartjs-plugin-zoom`.

## Verification
- `pnpm install && pnpm tsc --noEmit && pnpm exec vitest run && pnpm build` — all green
  (JS bundle ~541 kB, down from ~574 kB after dropping the plugin).
- Manual: Detailed shows ~10 diagonal labels + smooth scroll; Overview fits all with
  working toolbox + wheel/drag zoom-pan that stays put; point click → album board;
  sorting re-orders the plot and resets zoom; both tables fit with no horizontal
  scroll even for long usernames; dates read `DD.MM.YYYY` site-wide.
