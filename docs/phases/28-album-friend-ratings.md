# Phase 28 — See a friend's ratings from an album page

Adds a searchable "See a friend's ratings" dropdown to the album page. It lists
the current user's accepted friends who have **published** a rating for that
album. Picking a friend jumps straight to the same detail views normally reached
from a dashboard:

- If **you** have already published a rating for the album → the **pair
  comparison** page (`/friendships/:id/albums/:spotifyId`, you vs friend vs
  Spotify).
- Otherwise → the **friend vs Spotify** page (`/users/:username/albums/:spotifyId`).

On either page, **"Back to dashboard"** now returns to *the friend's* dashboard
with the right comparison pre-selected: the pair comparison (you selected) in the
first case, or Spotify-only in the second. Reaching these pages the normal way
(clicking a dashboard row) still uses history back — behaviour is unchanged when
no navigation state is passed.

## Backend

- **`app/schemas/album.py`** — new `AlbumFriendRating` schema
  (`username`, `display_name`, `profile_picture_url`, `friendship_id`).
- **`app/routers/albums.py`** — new `GET /albums/{spotify_id}/friend-ratings`.
  Returns the caller's accepted friends who have a published rating for the album,
  each stamped with the `friendship_id` linking the pair (so the frontend can open
  the pair dashboard without a second lookup). Returns `[]` when the album isn't
  imported or the user has no qualifying friends. Reuses `picture_url` for avatars,
  mirroring the friendship/invite routers. Declared before the `/{spotify_id}`
  route, next to `/{spotify_id}/stats`.

## Frontend

- **`src/api/albums.ts`** — `AlbumFriendRating` type + `getAlbumFriendRatings()`.
- **`src/lib/dashboardCompare.ts`** *(new)* — single home for the per-profile
  "Compare with" storage key: `compareStorageKey()`, `setDashboardCompare()` (seed
  a profile's comparison before navigating to it), and the `DashboardBackState`
  router-state type. Keeps the sessionStorage key in one place so detail pages and
  `ProfilePage` can't drift.
- **`src/pages/ProfilePage.tsx`** — uses `compareStorageKey(username)` for its
  persisted comparison instead of an inline template string (no behaviour change).
- **`src/pages/AlbumInfoPage.tsx` + `.module.css`** — fetches friend ratings
  alongside stats; renders the `FriendRatingsPicker` combobox (search over
  display name / username, click-outside + Escape to close) only when at least one
  friend has rated. `handlePickFriend` routes to the pair comparison or the
  friend-vs-Spotify view based on whether the viewer has published, attaching a
  `backTo` state so the destination's "Back to dashboard" lands on the friend's
  dashboard with the matching comparison.
- **`src/pages/AlbumDetailPage.tsx`, `FriendAlbumDetailPage.tsx`** — "Back to
  dashboard" reads `location.state.backTo`; when present it seeds the friend's
  comparison via `setDashboardCompare` and navigates to `/profile/:username`,
  otherwise falls back to `navigate(-1)` (the existing dashboard-origin flow).

## Tests

- **`backend/tests/test_albums.py`** — friend-ratings lists only published
  friends (excludes non-friends and drafts), empty for an un-imported album,
  requires auth.
- **`frontend/src/pages/AlbumInfoPage.test.tsx`** — picker hidden when no friend
  has rated; picking a friend opens the pair comparison (with `backTo`
  `compareFriendshipId`) when you've rated, or the friend-vs-Spotify view (with
  `compareFriendshipId: null`) when you haven't. Existing `../api/albums` mock
  extended with `getAlbumFriendRatings`.

## Verification

- `cd backend && uv run pytest` → **155 passed** (+3 new).
- `cd frontend && pnpm test` → **44 passed** (+3 new); `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Manual at `localhost:5173` (owner to confirm): on an album page, the dropdown
  lists friends who rated it; picking one opens the comparison / friend view per
  your own rating status, and "Back to dashboard" lands on that friend's dashboard
  with the expected comparison.

## Notes

- **New endpoint vs. frontend-only.** The alternative was to fetch each friend's
  dashboard and scan for the album client-side — N requests and over-fetching. A
  small dedicated endpoint is one round-trip and returns exactly what the picker
  needs (including `friendship_id`), matching the existing `/stats` pattern.
- **"Rated" means published.** Only published ratings surface here; a draft can't
  produce a pair-dashboard entry, so the comparison page would have nothing to show.
- **Seeding the comparison via sessionStorage** (rather than adding router-state
  handling to `ProfilePage`) reuses the existing `usePersistentState` persistence,
  so the friend's profile opens with the right view and no first-render flash.
- No new libraries.
