# Phase 35 — Compare with any viewable profile (not just friends)

## Context

The "Compare with you" button and the whole pair-comparison feature only appeared
between **friends**. But if I can already see a profile's dashboard (a public
account, or a friends-only account I'm friends with), I should be able to compare
my ratings with theirs — friendship shouldn't be required.

The blocker: comparison was keyed on a `Friendship` row + the precomputed
`friend_dashboard_entries` table, from the backend endpoint down to the frontend
`friendshipId` props. This phase adds a **username-based comparison** computed
**live** (no friendship, nothing persisted) and reuses the existing comparison UI
for both friends and non-friends. Deferred from phase 34.

## Backend

- **`GET /users/{username}/comparison`** (`routers/users.py`): live pair
  comparison between the current user (always **A**, so "you" is a stable column)
  and any viewable user (B). Intersects both users' **published** ratings and
  builds the same `FriendDashboardEntryOut` rows as the friend dashboard —
  pairwise similarity + each user's vs-Spotify similarity, scores, mean,
  mutual_date, top-track indices — using the existing `compute_ranking_loss` /
  `compute_similarity_score` / `BaselineStat` helpers. Nothing is written.
  Self → 400; unknown user → 404.
- **Shared access check**: extracted the visibility gate from `get_user_dashboard`
  into `require_can_view_profile(db, viewer, target)` and call it from both the
  solo dashboard and the new comparison endpoint (identical rules + messages:
  owner ok; private → 403; friends-only non-friend → 403).
- **Schema**: `FriendDashboardResponse.friendship_id` → `int | None`
  (`schemas/friend_dashboard.py`); the live comparison returns `None`, so the
  existing frontend types/components consume the same shape.

## Frontend

- **API** (`api/friendDashboard.ts`): `friendship_id: number | null`; new
  `getUserComparison(username)`; a `ComparisonSource =
  { kind: "friendship"; friendshipId } | { kind: "user"; username }` discriminated
  type + `fetchComparison(source)` dispatcher.
- **`FriendDashboard`** (`pages/FriendDashboardPage.tsx`): takes a `source` instead
  of a `friendshipId`. Fetch via `fetchComparison`; persisted-state namespace is
  per-source (`dash:pair:f{id}` / `dash:pair:u{username}`); row/point clicks route
  to `/friendships/{id}/albums/…` (friend) or the new `/users/{username}/compare/…`
  (user).
- **Per-album detail** (`pages/FriendAlbumDetailPage.tsx`): generalized to read
  either `:friendshipId` or `:username` from the route and build a
  `ComparisonSource`; registered on both `/friendships/:friendshipId/albums/:spotifyId`
  and the new `/users/:username/compare/:spotifyId` (`App.tsx`). `comparePath()`
  added to `lib/paths.ts`.
- **Back-state** (`lib/dashboardCompare.ts`): the persisted compare selection and
  the album→dashboard `DashboardBackState` now carry a `ComparisonSource | null`
  (`compareSource`) instead of a bare `compareFriendshipId`. Updated the two
  album-detail pages and `AlbumInfoPage.handlePickFriend` accordingly.
- **ProfilePage** (`pages/ProfilePage.tsx`): compare state is now
  `ComparisonSource | null`. The "Compare with you" / "Hide comparison" button
  shows whenever `!isOwner && viewerCanSeeDashboard` (not only for friends);
  toggling picks a friendship source if we're friends, else a user source.
  Renders `<FriendDashboard source={…} />` when comparing, else the solo
  dashboard. The item-3 reconciliation still drops a stale **friendship** id back
  to solo; a user source has no id to go stale.

## Files touched

### Backend
- `backend/app/routers/users.py` — `require_can_view_profile` helper; `get_user_dashboard` uses it; new `get_user_comparison` endpoint + `_pair_similarity` helper.
- `backend/app/schemas/friend_dashboard.py` — `friendship_id: int | None`.
- `backend/tests/test_user_comparison.py` — new: happy path, viewer-is-A, no-mutual, self/private/friends-only/unknown/auth access cases (10 tests).

### Frontend
- `frontend/src/api/friendDashboard.ts` — nullable id, `getUserComparison`, `ComparisonSource`, `fetchComparison`.
- `frontend/src/lib/paths.ts` (+ `paths.test.ts`) — `comparePath`.
- `frontend/src/lib/dashboardCompare.ts` — `compareSource: ComparisonSource | null`.
- `frontend/src/pages/FriendDashboardPage.tsx` — `source`-driven fetch/namespace/links.
- `frontend/src/pages/FriendAlbumDetailPage.tsx` — dual-route source detection.
- `frontend/src/pages/ProfilePage.tsx` — generalized compare button + state + render + reconciliation.
- `frontend/src/pages/AlbumInfoPage.tsx` (+ `AlbumInfoPage.test.tsx`) — back-state uses `compareSource`.
- `frontend/src/pages/AlbumDetailPage.tsx` — back-state uses `compareSource`.
- `frontend/src/App.tsx` — new `/users/:username/compare/:spotifyId` route (same component).

## Library / alternatives

No new library. Compute-live-don't-persist (vs. reusing `friend_dashboard_entries`
for non-friends) was chosen with the user — that table is `friendship_id`-keyed and
maintained by friendship events; repurposing it would need a non-friendship pairing
identity + rebuild triggers. Live compute reuses the exact similarity math with no
schema/lifecycle changes. Reused the friend dashboard + per-album detail UI rather
than duplicating them, by parameterizing on `ComparisonSource`.

## Verification

- `cd backend && pytest` — 185 passed (+10 new comparison tests).
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — green (62 tests, +2 new `comparePath`).
- Manual (user to confirm) at `localhost:5173`:
  1. Public non-friend with mutual ratings → "Compare with you" appears; toggle
     shows the live table/chart; "you" is column A.
  2. Click an album row → `/users/{username}/compare/{spotifyId}`; "Back to
     dashboard" re-opens the comparison.
  3. Friends-only: friend → compare works; non-friend → no dashboard/button.
  4. Existing friend comparison + its per-album detail unchanged.
