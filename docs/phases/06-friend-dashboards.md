# Phase 6 — Friend dashboards

Shared dashboard for any accepted friend pair, auto-populated from the intersection of the two users' published ratings. The derived table is rebuilt on each rating publish/delete and on friendship accept; ORM cascade clears it on unfriend.

## Files

### Backend

- [backend/app/models/friendship.py](../../backend/app/models/friendship.py) — added `FriendDashboardEntry` model (`friendship_id`, `album_id`, `mutual_date`, `similarity_users`, `mean_score`, `user_a_score`, `user_b_score`) with `UniqueConstraint(friendship_id, album_id)`. Added a `dashboard_entries` relationship on `Friendship` with `cascade="all, delete-orphan"` so deleting a friendship row also drops its derived entries.
- [backend/app/models/\_\_init\_\_.py](../../backend/app/models/__init__.py) — registered `FriendDashboardEntry`.
- [backend/alembic/versions/a7b3f1c98e21_add_friend_dashboard_entries.py](../../backend/alembic/versions/a7b3f1c98e21_add_friend_dashboard_entries.py) — migration creating the new table with FK + unique index.
- [backend/app/services/friend_dashboard.py](../../backend/app/services/friend_dashboard.py) — `rebuild_for_pair(db, friendship_id)` (single entry point per the plan) wipes and re-derives the rows from both users' currently-published ratings. `rebuild_for_user(db, username)` is a thin convenience that walks every accepted friendship the user is in and calls `rebuild_for_pair` for each. Similarity between the two users uses the same `compute_ranking_loss` + `BaselineStat` z-score formula as Phase 4.
- [backend/app/schemas/friend_dashboard.py](../../backend/app/schemas/friend_dashboard.py) — `FriendDashboardEntryOut`, `FriendDashboardResponse`. Reuses `DashboardAlbum` from Phase 4.
- [backend/app/routers/friendships.py](../../backend/app/routers/friendships.py) — added `GET /friendships/{id}/dashboard` (403 unless accepted and the requester is in the pair). Hooked `rebuild_for_pair` into the accept handler.
- [backend/app/routers/ratings.py](../../backend/app/routers/ratings.py) — `rebuild_for_user(db, current_user.username)` is called after publish and after deleting a published rating.
- [backend/tests/test_friend_dashboard.py](../../backend/tests/test_friend_dashboard.py) — 7 tests: accept seeds 2 entries for 2 mutual albums (with `mutual_date` = later completion, correct user_a/user_b scores by ordered pair, similarity math); publishing a third mutual rating adds an entry; deleting a published rating removes its entry; unfriending clears entries via ORM cascade; 403 on pending and stranger access; 404 on unknown friendship.

### Frontend

- [frontend/src/api/friendDashboard.ts](../../frontend/src/api/friendDashboard.ts) — `FriendDashboardEntry`, `FriendDashboardResponse` types and `getFriendDashboard(friendshipId)`.
- [frontend/src/pages/FriendDashboardPage.tsx](../../frontend/src/pages/FriendDashboardPage.tsx) — full demo-style dashboard for the pair. Controls (sort by date / mean score / similarity, mode toggle similarity↔ratings, artist/album filter, from/to date), Chart.js line plot (single line in similarity mode, two lines in ratings mode), and a table whose rows link to the shared album detail page. Reuses [ProfileDashboardPage.module.css](../../frontend/src/pages/ProfileDashboardPage.module.css) so the two pages look identical.
- [frontend/src/pages/FriendAlbumDetailPage.tsx](../../frontend/src/pages/FriendAlbumDetailPage.tsx) — three-column page (user A top 5 / user B top 5 / Spotify top 5). Resolves both usernames via `/friendships/{id}/dashboard`, fetches the album once and each user's dashboard entry to pull their top 5 and score. Reuses [AlbumDetailPage.module.css](../../frontend/src/pages/AlbumDetailPage.module.css).
- [frontend/src/App.tsx](../../frontend/src/App.tsx) — added `/friendships/:friendshipId/dashboard` and `/friendships/:friendshipId/albums/:spotifyId` routes (both gated by `ProtectedRoute`).
- [frontend/src/pages/FriendsPage.tsx](../../frontend/src/pages/FriendsPage.tsx) — accepted-friend cards now expose two buttons: "Their dashboard" (Phase 4) and "Pair dashboard" (Phase 6).

## Notes / decisions

- **Derived table vs. computed on-read**: the plan calls for a stored derived table, so `FriendDashboardEntry` is materialised. Cost of a rebuild is `O(min(|A_pub|, |B_pub|))` and only fires on friendship accept and on each rating publish/delete by either party, so the simpler "wipe and re-insert" beats incremental diffing for v1. Alternative considered: computing the intersection on every GET — rejected because the plan explicitly wants the derived rows for later phases (e.g. Phase 7 invite completion hook).
- **`rebuild_for_user` vs. iterating in the router**: kept the per-pair entry point intact per the plan ("single `rebuild_for_pair(friendship_id)` entry point"). `rebuild_for_user` is a one-line wrapper that loops, so the rating router stays free of friendship-lookup logic.
- **ORM cascade instead of FK `ON DELETE CASCADE`**: the FK migration still declares `ON DELETE CASCADE` for Postgres, but the ORM-level `cascade="all, delete-orphan"` is what actually drives the in-test deletion (SQLite doesn't enforce FK cascades unless `PRAGMA foreign_keys = ON`, which the app doesn't set). With the relationship configured, `db.delete(friendship)` issues explicit DELETEs for the children, working uniformly on SQLite and Postgres without a session-level pragma. Alternative considered: a `before_delete` event listener — rejected as more magic for the same effect.
- **Friend album detail fetches both users' dashboards**: rather than adding a third "give me both users' top 5 for this album" endpoint, the page reuses `GET /users/{username}/dashboard` twice. The requester is in the accepted friendship, so `are_friends` already lets the call through even if either profile is `private`. Keeps the backend surface smaller.
- **Similarity formula matches Phase 4**: pair similarity uses the exact same `compute_ranking_loss` + baseline z-score as user-vs-Spotify, so the two dashboards share a single mental model.

## Verification

- `cd backend && pytest` → 64 passed.
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` → all green.
- Manual: with two users alice/bob both friends and both with published ratings on two shared albums, log in as alice, click "Pair dashboard" from the friends list, see both entries with correct `mutual_date` = max(completed_at); publish a third shared album as bob and refresh — the new row appears. Delete one published rating from alice and the matching pair row disappears. Unfriend → the dashboard 403s and the entries are gone in the DB.
