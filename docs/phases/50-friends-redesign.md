# Phase 50 — Friends page redesign (requests rail + friends grid)

Visual redesign of the Friends page (`/friends`) to the Warm Peach system, chosen
from a design exploration ("Option B" — mirrors the Listen & Rate layout). Same
functionality (live people search, incoming/outgoing requests, friends list, all the
actions), better looking and consistent with the redesigned pages.

## What changed

- **Standardized width/margins** (`min(93vw, 1560px)`), replacing `PageContainer`.
- **Prominent full-width people search** on top: an album-style pill searchbar with a
  Warm-Peach dropdown of results. Each result: avatar + display name + handle, a
  friends-only `LockIcon` pill, and a state-driven action — **Add** (`UserPlusIcon`,
  green), **Requested** / **Friends** (quiet status text), or **Accept + Decline**
  (icon buttons) when they've already requested me.
- **Two-column layout** (no tabs): a **sticky requests rail** on the left with
  **Incoming** and **Outgoing** boxes in the Home-`TrendingBox` style (avatar + name +
  accept/decline/cancel icon buttons; empty lines when none), and the main area showing
  **"Your friends" as a card grid** (avatar, name link, **Unfriend** with a compact
  inline icon-confirm). Requests are now always visible instead of hidden behind tabs.
- **Icon action buttons** with the shared tints + tooltips + hover fills (green
  Add/Accept, clay-red Decline/Cancel/Unfriend); the unfriend keeps a confirm step
  (trash → "Unfriend? ✓ ✕"). Dark-mode overrides match Listen & Rate.
- Sticker cards (`border-w` + `radius-lg` + offset shadow, dark hairline+offset) for the
  request boxes, friend cards, and the empty state.

### Follow-up polish

- **Request boxes cap at ~5 rows, then scroll** (`.tlist` `max-height: 280px; overflow-y: auto`
  with a thin themed scrollbar), matching the Home trending boxes.
- **"Your friends (N)"** — the friend count moved into the heading as a smaller, quieter
  `(N)` (non-display body font, `--text-muted`), mirroring the album page's "Tracks (N)".
  The subtitle is now a static tagline ("Find people and grow your circle.").
- **Un-clipped tooltips inside scroll panels** — search-result and rail request icon buttons
  use a new `data-tip-pos="left"` tooltip variant so the "Add friend" / Accept / Decline /
  Cancel chips render beside the button (in the foreground) instead of being clipped by the
  panel/list `overflow`.
- **Dark date-picker glyph** (Profile dashboard From/To filters) — the native
  `::-webkit-calendar-picker-indicator` is inverted in dark mode so it's visible on the dark
  field (`ProfileDashboardPage.module.css`).

## Files touched

- `frontend/src/components/Icons.tsx` — added `UserPlusIcon`.
- `frontend/src/pages/FriendsPage.tsx` — rewritten render: top search + dropdown,
  `RequestBox`/`RequestRow`, `FriendCard` (inline unfriend confirm), shared `IconButton`;
  all the data/search/action logic (debounced search, `searchState`, accept/decline/
  cancel/send/remove) unchanged. Dropped `PageContainer`/`Button`/`ConfirmButton`/`Card`
  and the tabs. Follow-up: static subtitle + "Your friends (N)" heading; `IconButton`
  gains a `tipPos="left"` prop set on the search-result and rail request buttons.
- `frontend/src/pages/FriendsPage.module.css` — rewritten to the search/dropdown, split
  layout + sticky rail, trending-style request boxes, icon buttons, friend-card grid,
  and empty state (with dark overrides). Follow-up: `.tlist` scrolls after ~5 rows;
  added `.friendsCount`.
- `frontend/src/index.css` — added the `data-tip-pos="left"` tooltip variant.
- `frontend/src/pages/ProfileDashboardPage.module.css` — inverted the native date-picker
  calendar glyph in dark mode so it's visible.

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files); FriendsPage has no unit test (logic unchanged).
- Follow-up polish re-verified: `tsc` clean, 76 tests pass, `pnpm build` clean.
- `pnpm build` — clean.

## Notes

- No new libraries. Reuses `Avatar`, `Alert`, `LoadingState`, icons, the search logic,
  and the same searchbar/trending-box/icon-button patterns as the other redesigned pages.
- Direction chosen via a throwaway HTML mockup under `design-explorations/`.
