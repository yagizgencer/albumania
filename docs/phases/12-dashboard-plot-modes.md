# Phase 12 — Dashboard plot modes, table fit & global date format

Replaced the brittle chart zoom with two explicit, robust view modes; made the
dashboard tables fit the page with no horizontal scroll; and standardized all
date displays to `DD.MM.YYYY`.

## Approach / choice
- **Dropped `chartjs-plugin-zoom`** (it shifted the whole plot on small zooms).
  Zoom/scroll is now a **CSS overflow scroll container + a width-scaled canvas**
  (`maintainAspectRatio:false`, fixed-height scroll area, width driven by a sizer
  div). Zoom = wider canvas, pan = native scroll — predictable and dependency-free.
  Alternative considered: reconfigure the plugin — rejected; the canvas-width
  approach is the standard, controllable way to do horizontal zoom/scroll.
- **Two modes:** **Detailed** (default) — ~10 diagonal album-name x labels, y
  fully fitted, horizontal scroll for the rest. **Overview** — labels hidden,
  fit-all by default, zoom in/out/pan via a subtle toolbox plus free mouse
  (wheel zoom anchored at the cursor, drag-to-pan).

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
