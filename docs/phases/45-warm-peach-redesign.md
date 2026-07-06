# Phase 45 — "Warm Peach Pro" redesign: light/dark themes + professional layout

A full visual redesign. The UI had drifted (inconsistent spacing/colors, weak
hierarchy, amateur layout with narrow center columns and empty sides). After
exploring several complete directions in a temporary `/styleguide` gallery, the users
chose a warm, cozy-but-professional **neobrutalist** look — "Warm Peach Pro" — and we
built it out across the whole app with **light + dark themes**.

**Design decisions:** Patrick Hand (headings) + Comic Neue (body). Palette (same hues
in both themes): coral `#f2a6a0` = primary action, teal `#4fb8a4` = selected/active,
amber `#f0c66a` = data/info; warm-ink borders (~3px) + hard offset "sticker" shadows;
8px radius. Light: blush-cream paper + dark ink. Dark: warm charcoal paper + light ink;
accent fills stay light so their dark ink still reads. One primary action per screen;
selected ≠ hover; no native `<select>`s.

**Library decision:** no new UI library — the app already drives all styling through
CSS custom properties, so a "theme" is just a token set (light `:root` + a
`[data-theme="dark"]` override block). Alternative considered: a component library
(Radix/shadcn) — rejected as a large rewrite against the project's "plain CSS modules"
rule. Only `roughjs` (already present) is reused for the sketch underline.

## Design system & theming (foundation)

- `frontend/src/index.css` — rewritten token system: Warm Peach palette + neutrals with
  a `[data-theme="dark"]` override block; new semantic `--danger/info/success-bg+text`,
  `--overlay`, `--shadow-modal`, `--danger-tint` (theme-aware); structure tokens
  (`--border-w`, radii, offset shadows); kept the 8px spacing scale + type scale.
  Removed the dead `--v2-*` block, `--pastel-*` aliases, and the old `.auth-page` rule.
  Global `button/input/select/a` restyled on tokens; `color-scheme: light dark`.
- `frontend/src/context/ThemeContext.tsx` — **new**: `theme` (resolved light/dark),
  `preference` (system/light/dark, default system), `setPreference`; resolves "system"
  via `matchMedia` with a live listener, writes `data-theme` on `<html>`, persists to
  `localStorage`, updates the `theme-color` meta, and re-applies chart defaults.
- `frontend/index.html` — inline no-flash script sets `data-theme` before first paint;
  trimmed trial fonts to Patrick Hand + Comic Neue; warm `theme-color`.
- `frontend/src/App.tsx` — wrap the app in `<ThemeProvider>`; removed `/styleguide` route.
- `frontend/src/lib/chartTheme.ts` — theme-aware: `applyChartTheme()` reads ink/grid from
  CSS vars (called on theme change); Comic Neue; warm accent chart palette (+ back-compat
  aliases for the dashboards until their palette is repointed).

## New shared components

- `Tabs.tsx` (+ css) — **rectangular** segmented control (replaces the old oval pills);
  active cell fills with the selection color, hover on inactive = faint tint.
- `Select.tsx` (+ css) — custom dropdown (trigger + own popup, keyboard + outside-click),
  replacing **all native `<select>`s** so the OS never draws its dark menu.
- `AuthLayout.tsx` (+ css) — two-panel auth hero (brand block + form card) collapsing to a
  centered card on mobile; wraps all five auth pages (replaces the lonely 360px column).
- `MetricSwitch.module.css` — **new**: MetricSwitch reworked to use the shared `Tabs`.

## Component sweep (restyled on the new tokens / theme-safe)

- `Button.tsx` + css — added `ghost` intent; per-intent hover (darker shade of its own
  color); focus-visible ring; disabled state.
- `Card`, `Avatar`, `Alert` (now uses the semantic bg/text tokens — no hardcoded
  indigo/green/red), `Spinner`, `NavBar`, `TopSearch`, `UnsavedChangesModal`,
  `AlbumCard` (status badges → theme tokens), `CommentItem` (danger button → tokens),
  `CommentsSection` + `CommentComposer` (sort/order/visibility → custom `Select`),
  `ActivityFeed` (filter chips → teal selection), `SketchUnderline` (resolves a CSS-var
  color so it follows the theme), `PeriodToggle` (→ shared `Tabs`).
- Removed orphaned `PeriodToggle.module.css` and the dead `.switch/.segmented` CSS in
  `ProfileDashboardPage.module.css`.

## Page sweep (tokens, layout, hierarchy — light + dark)

- `SettingsPage.tsx` + css — **full-width** two-column layout (sticky tab rail + content
  cards) replacing the narrow 760px column; new **Appearance** tab with the
  System/Light/Dark toggle; visibility → custom `Select`; removed stray `#10b981`.
- `HomePage` — Warm Peach palette, roomier activity feed, teal-selected filter chips,
  CTAs via shared `ButtonLink`.
- `AlbumInfoPage` — "View artist page" is now a text link (not a button); Rate is the
  clear primary; lighter Tracks accordion; overlay/combo shadows → tokens.
- Auth pages (Login/Register/Forgot/Reset/Verify) — all wrapped in `AuthLayout`, buttons
  → shared `Button`.
- Token/color sweeps on `ProfileDashboardPage`, `FriendDashboardPage`, `ListenLaterPage`,
  `RatingEditorPage`, `AlbumDetailPage`, `ArtistPage`, `FriendsPage`, `ProfilePage`
  (gradient repointed to warm accents; modal shadows → tokens).

## Tests
- `test-setup.ts` — stub `window.matchMedia` (jsdom lacks it; ThemeContext needs it).
- Updated `CommentsSection.test.tsx`, `SettingsPage.test.tsx`, `AlbumInfoPage.test.tsx`
  for the new markup (custom Select dropdowns, "View artist page" link, tab buttons).

## Verification
- `cd frontend && pnpm tsc --noEmit` — clean.
- `pnpm test` — 75 passed. `pnpm build` — succeeds.
- `cd backend && pytest` — unchanged (frontend-only phase).
- Manual (to sign off in-browser at `localhost:5173`): OS light/dark is followed;
  Settings → Appearance overrides and persists; all pages readable in both themes; no OS
  dropdowns; Settings/auth fill the width; tabs rectangular.
