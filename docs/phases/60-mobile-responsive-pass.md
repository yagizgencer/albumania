# Phase 60 — Mobile responsive pass

The app was tuned for desktop only. On a phone (~360–390px CSS viewport) the
navbar search collapsed to an unusable sliver, every card and heading rendered
at desktop size, and the home timeline sat two full screens below the fold.

Root cause: **there was no breakpoint below 560px anywhere in `src/`**. All 15
existing media queries were tablet-tier "collapse the two-column rail" rules
(560/620/640/720/820/860/880/900), so below ~600px the app was simply the tablet
layout squeezed. Design tokens were fixed at desktop values.

## Breakpoint convention

Each page keeps its own tablet breakpoint — each is correctly derived from that
page's own rail width (`390px 1fr`, `330px 1fr`, …) and nothing was renumbered.
On top of those, **`@media (max-width: 560px)` is the one shared phone tier**,
used app-wide and documented at the top of `index.css`.

## Files touched

### Design system

- **`frontend/src/index.css`** — Added the phone tier: one `@media (max-width: 560px)`
  block that re-declares `--nav-height` (76→56px), `--page-pad` (16→12px),
  `--space-5/6/8`, `--text-xl/lg`, `--border-w`, `--radius-lg` and the three
  sticker-shadow offsets. Every component reads these, so the whole app tightens
  at once. The `[data-theme="dark"]` overrides are **repeated inside the block**
  — dark declares the same tokens at file scope with equal specificity and sits
  above it, so without that the phone `:root` would strip dark's warm bevel.
  Also shrinks the global `main` vertical margin. Documents the convention.

### Navbar + search

- **`frontend/src/components/NavBar.tsx`** — Added a `searchOpen` state. The
  inline search is replaced on phones by a magnifier button that expands a
  full-row overlay with a close button; the inline field unmounts while the
  overlay is open so only one search input is ever in the DOM. Closes on route
  change (`useLocation`), on Escape, on close, and after a result is picked.
- **`frontend/src/components/NavBar.module.css`** — Phone tier: 66→40px logo,
  46→40px icon buttons with 26px glyphs (CSS overrides the SVG `width`/`height`
  attributes, so no prop threading), tighter padding and gaps. Added
  `.searchInline` / `.searchBtn` / `.searchOverlay` / `.searchClose`. The overlay
  is absolutely positioned against the already-`sticky` nav, and a `min-width: 561px`
  rule keeps it from covering the desktop nav after a resize.
- **`frontend/src/components/TopSearch.tsx`** — Added optional `autoFocus` and
  `onClose` props for the expanded phone row. The Escape/outside-click effect now
  also runs while the dropdown is shut when `onClose` is set, so Escape can
  collapse the row with no results showing.
- **`frontend/src/components/TopSearch.module.css`** — Added `min-width: 0` to
  `.wrap` (without it the wrap refuses to shrink past the `<input>`'s ~190px
  intrinsic minimum, so a tight navbar overflowed sideways instead of squeezing —
  this was the actual cause of the invisible search field). Bumped `.input` to
  `1rem` (0.95rem = 15.2px made iOS Safari zoom on focus). Phone tier pins the
  results panel to the row edges so it can't run off screen.
- **`frontend/src/components/NavBar.test.tsx`** — Two new tests: the phone search
  row expands/collapses with correct `aria-expanded` and exactly one mounted
  input, and Escape closes it.

### Home page

- **`frontend/src/pages/HomePage.tsx`** — Added a `trendingTab` state and a
  phone-only `Tabs` bar (reuses the existing `components/Tabs.tsx`, `variant="subtle"`)
  that turns the two stacked trending boxes into one tabbed box. Each box is
  wrapped in a `.pane`; the tab bar sits in its own wrapper div so its `display`
  doesn't fight `Tabs`' own rule at equal specificity.
- **`frontend/src/pages/HomePage.module.css`** — `.trendingTabs` (hidden above the
  phone tier) and `.pane` / `.paneOff` (`display: contents` on desktop, so the
  sticky rail lays out exactly as before). Phone tier also gives `.page` the
  standard `--page-pad` instead of its 0.35rem navbar-alignment gutter.
  **Landing:** `.landingLogo` 210px → `clamp(110px, 34vw, 210px)`; `.landingHero`
  `clamp(3rem, 6vw, 4.5rem)` → `clamp(2.25rem, 11vw, 4.5rem)` (the 6vw term never
  left its 3rem floor below ~800px, so it was effectively fixed at 48px);
  `.landingBullets` uses `minmax(min(240px, 100%), 1fr)`; bullets get tighter
  padding and type. `.landing` switches to `align-items: flex-start` on phones —
  a centered flex item taller than its container overflows symmetrically and the
  overflow above the top edge **cannot be scrolled to**, which clipped the logo.
- **`frontend/src/components/TrendingBox.module.css`** — Phone tier: 56→50px rows,
  a four-row list instead of five, tighter padding, and the `<h2>` becomes
  screen-reader-only (the tab bar names the list). Together this drops the height
  above the feed from ~700px to ~275px.
- **`frontend/src/components/ActivityFeed.module.css`** — Fixed the sticky date
  pills, which slid **under** the sticky navbar at every width (`top: 0` →
  `top: calc(var(--nav-height) + var(--space-1))`). Phone tier: bigger filter-chip
  tap targets (~26px → ~36px), hides the "Show" label (the group keeps its
  `aria-label`), tighter row padding.
- **`frontend/src/pages/HomePage.test.tsx`** *(new)* — Covers the trending tab
  state and that both lists stay mounted at every width.

### Auth pages

- **`frontend/src/components/AuthLayout.tsx`** — Added a compact logo + wordmark
  row above the form card. Below 820px the gradient hero is hidden, which left
  every auth page with no branding at all.
- **`frontend/src/components/AuthLayout.module.css`** — `.heroLogo` and
  `.heroWordmark` get the same clamps as the landing hero; `.card h1` becomes
  `clamp(1.5rem, 6vw, 2rem)`; added `.compactBrand` / `.compactLogo` /
  `.compactWordmark`, shown only while the hero is hidden.

### Card grids

- **`frontend/src/components/AlbumCard.module.css`** — Phone tier trims padding,
  title size, chip size and badge size to suit a ~160px cell, and lets `.meta`
  wrap (two nowrap chips don't fit side by side at that width).
- **`frontend/src/pages/FriendsPage.module.css`**, **`ListenLaterPage.module.css`**,
  **`ArtistPage.module.css`** — Phone tier switches the `auto-fill minmax(180–260px)`
  grids to `repeat(2, minmax(0, 1fr))`. They previously fell to a single column,
  producing one enormous album card per row. Also the standard `.page` padding,
  and `ListenLaterPage`'s `.comboList` loses its 230px floor.

### Remaining pages

- **`frontend/src/pages/AlbumDetailPage.module.css`**, **`AlbumInfoPage.module.css`** —
  The 720px rule stacks the header, turning the cover into a ~290px square that
  pushed all metadata below the fold; the phone tier restores a `132px 1fr`
  header instead. `.card` padding drops from 24/32px (≈70px of a 336px content
  box) to 12px. `AlbumInfoPage`'s `.searchBar` loses its 15rem floor.
- **`frontend/src/pages/ArtistPage.module.css`** — Had **no media query at all**.
  `.name` → `clamp(1.5rem, 7vw, 2.3rem)`; phone tier shrinks the 120px avatar to
  76px (120px + a 2.3rem name overflowed a 390px screen).
- **`frontend/src/pages/ProfileDashboardPage.module.css`** — Also had **no media
  query at all**, and its ratings table is `table-layout: fixed` with 6–7 columns,
  nowrap numeric cells and only `overflow-y` — so it blew out sideways and took
  the page with it. Below 720px `.tableWrap` gets `overflow-x: auto` and the table
  a 640px floor, so it scrolls inside its own card. Phone tier fixes `.page`
  padding and drops the now-useless `margin-left: auto` on the wrapped controls.
- **`frontend/src/pages/ProfilePage.module.css`** — Phone `.page` padding;
  `.searchBar` loses its 13rem floor (it forced horizontal page scroll).
- **`frontend/src/pages/SettingsPage.module.css`** — Phone `.page` padding; the
  three theme cards stack instead of sharing ~100px each.
- **`frontend/src/pages/RatingEditorPage.module.css`** — Phone `.page` padding,
  `.card` padding trimmed, and the Top-5 `.slot` loses its 172px floor.

## Notes

- No new libraries. The tabbed trending box reuses the existing `Tabs` component
  (`variant="subtle"`), and the search icons reuse `SearchIcon` / `CloseIcon`
  from `components/Icons.tsx`.
- Consolidating the nine hand-copied `.page` wrappers onto the existing
  `PageContainer` component, and the eight hand-copied "sticker card" blocks onto
  `Card`, is real duplication but was deliberately left out — it would have made
  this diff unreviewable. Worth its own phase.
- Every change is inside a `≤560px` (or existing) media query except the `clamp()`
  swaps, the `min-width: 0` fixes, the `overflow-x` fix and the sticky-header
  offset — all of which are strictly safer at every width.

## Verification

- `cd backend && pytest` — 251 passed.
- `cd frontend && pnpm test` — 102 passed (25 files, 3 new). `pnpm tsc --noEmit`
  and `pnpm build` clean.
- Manual pass still to do in the browser at 360×800 and 390×844, plus a desktop
  regression check at ≥1280px.
