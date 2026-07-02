# Phase 29 — UI redesign, shared design system, live friends search & private-profile view

Goal: unify the cozy "sketchbook" theme so it reads intentional, make every page align to
one width, fix button/shape inconsistency, give the Friends page live (debounced) search like
the top-nav search, and make viewing a private profile show the header + a clear "private" card
instead of feeling broken. Theme decisions (kept with the user): keep the Patrick Hand + Nunito
sketchbook look, stay on plain CSS modules + existing design tokens (no UI library), standardize
on one wider page width (~1140px).

## New shared components

- `frontend/src/components/PageContainer.tsx` (+ `.module.css`) — shared `<main>` wrapper with
  `width="default" | "narrow" | "wide"` (≈1140 / 760 / 1320px) so pages align to the same edges
  with responsive side padding.
- `frontend/src/components/Button.tsx` (+ `.module.css`) — one Button + ButtonLink with
  `intent` (primary/secondary/danger/success) and `size` (sm/md), built entirely on the `--btn-*`
  tokens, 2px inked border, `--radius`, offset shadow and the hand-placed hover/active nudge.
- `frontend/src/components/Card.tsx` (+ `.module.css`) — shared paper-surface card (2px inked
  border, `--radius`, `--shadow-soft`) for list rows / small panels.

## Design tokens

- `frontend/src/index.css` — added page-width tokens (`--page-max`, `--page-max-narrow`,
  `--page-max-wide`, `--page-pad`) and a small type scale (`--text-xl…--text-xs`). Global `main`
  now uses `--page-max` / `--page-pad` (was a narrow fixed 720px). Fonts unchanged (audit confirmed
  every heading already uses `--font-display`, every body element inherits Nunito — no rogue fonts).

## Friends page

- `frontend/src/pages/FriendsPage.tsx` — rewritten: live debounced people search (400ms, no submit
  button; mirrors `TopSearch`) with a results panel that closes on outside-click/Escape; results and
  friend/incoming/outgoing lists now render as a responsive card grid
  (`repeat(auto-fill, minmax(280px, 1fr))`, single column ≤640px) using shared `Card` + `Button`;
  tabs are shared Buttons; private/friends-only users show a 🔒 pill in results.
- `frontend/src/pages/FriendsPage.module.css` — replaced ad-hoc 4/6px-radius, 1px-border styles with
  token-driven layout (search panel, card grid, private pill, responsive breakpoint).

## Private-profile view

- `backend/app/schemas/friendship.py` — `UserSearchResult` now includes `profile_visibility`.
- `backend/app/routers/users.py` — `search_users` populates `profile_visibility` (no query change;
  still returns all matching users).
- `backend/tests/test_friendships.py` — added `test_user_search_includes_visibility`.
- `frontend/src/api/friendships.ts` — `UserSearchResult` gains `profile_visibility`; added
  `ProfileVisibility` type.
- `frontend/src/pages/ProfileDashboardPage.tsx` — `ProfileDashboard` accepts an `onAccessBlocked`
  callback and distinguishes private vs friends-only from the 403 detail; stays silent (renders
  nothing) when blocked so the parent owns the messaging.
- `frontend/src/pages/ProfilePage.tsx` — routes through `PageContainer width="wide"`; always renders
  the profile header; shows a 🔒 privacy pill on the header when the viewer can't see the dashboard;
  renders a dedicated `PrivateNotice` card (private / friends-only, with an "add them as a friend"
  hint) in place of the dashboard. Friendship buttons, Edit, Save/Cancel and the compare toggle now
  use the shared `Button`. Confirmed there is no redirect-to-homepage on a private profile in the
  current code path (ProtectedRoute, axios interceptor and AuthContext all verified).
- `frontend/src/pages/ProfilePage.module.css` — dropped the page width override and all ad-hoc
  button classes (editBtn / friendBtn* / saveBtn / cancelBtn / compareToggleBtn); added `nameRow`,
  `privacyPill`, `privateNotice*`.

## Consistency sweep (width + buttons on the existing tokens)

- `frontend/src/pages/HomePage.module.css`, `ListenLaterPage.module.css`,
  `AlbumDetailPage.module.css`, `AlbumInfoPage.module.css`, `ArtistPage.module.css` — `.page` now
  uses the shared width/padding tokens (all pages align to ~1140px).
- `frontend/src/pages/AlbumInfoPage.module.css` — buttons aligned to the sketch look (2px inked
  border, `--radius`, offset shadow, token danger color instead of `#dc2626`).
- `frontend/src/pages/ListenLaterPage.module.css` — button radii normalized (was 4/6px), 1px borders
  → 2px, hard-coded reds → `--btn-danger-*`, sizes → type scale.
- HomePage CTAs and ArtistPage already matched the tokens — left as-is (ArtistPage is the quality bar).

## Verification

- `cd backend && pytest` → 156 passed.
- `cd frontend && pnpm test` → 44 passed; `pnpm tsc --noEmit` clean; `pnpm build` succeeds.
- Manual (to do in-browser at `localhost:5173`): Friends search shows matches live as you type;
  private user from search opens their profile with header + "private" card and **no redirect**;
  public/friend user's dashboard loads; pages share consistent margins/buttons at ~375/768/1440px.
