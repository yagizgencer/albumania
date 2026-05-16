# Phase 7 — Listen invites, album info page & Listen Later

Listen invites, the new album info page (the landing spot from album search), and a single Listen Later list that collapses solo drafts and shared listens into one view. Send an invite only to friends who haven't already published; delete a rating and you withdraw from every related invite.

## Files

### Backend

- [backend/app/models/invite.py](../../backend/app/models/invite.py) — new `ListenInvite` model (`sender_username`, `receiver_username`, `album_id`, `status` ∈ {`pending`, `accepted`, `completed`}, `created_at`, `responded_at`) with `UniqueConstraint(sender, receiver, album_id)`. Decline deletes the row, so duplicate-detection only has to check the directed pair plus the inverse on create.
- [backend/app/models/\_\_init\_\_.py](../../backend/app/models/__init__.py) — registered the new model.
- [backend/alembic/versions/b5d2f4a7e103_add_listen_invites.py](../../backend/alembic/versions/b5d2f4a7e103_add_listen_invites.py) — migration creating `listen_invites` with FKs, the unique pair-album index, and three single-column indexes used by the listen-later query.
- [backend/app/schemas/invite.py](../../backend/app/schemas/invite.py) — `ListenInviteCreate`, `ListenInviteOut`, `ListenInviteWithAlbum`, `ListenInviteListResponse`, plus the Listen-Later shape: `ListenLaterParticipant` (per-friend chip data) and `ListenLaterEntry` (album + my draft + participants).
- [backend/app/services/invite.py](../../backend/app/services/invite.py) — `maybe_complete_invites_for_rating(db, username, album_id)` flips every non-completed invite for that user/album to `completed` if the other party has also published, and rebuilds the corresponding `Friendship` pair's dashboard. `delete_invites_for_user_album` is called after rating delete to drop the user out of every related invite.
- [backend/app/routers/invites.py](../../backend/app/routers/invites.py) — two routers exported from one file:
  - `/invites` — `POST` (rejects non-friends with 403; rejects 409 when receiver already published or when an invite between the pair for the album already exists in either direction), `POST /{id}/accept` (receiver only, must be `pending`), `POST /{id}/decline` (receiver only, deletes), `GET /me` (split into incoming / outgoing / completed).
  - `/listen-later` — single `GET` returning `ListenLaterEntry[]`. The entry set is the union of (a) my draft ratings and (b) albums where I'm a "qualifying" participant on a non-completed invite (any outgoing invite of mine, plus incoming invites I've already accepted). Pending **incoming** invites are not yet in Listen Later — you have to accept first; they live under "incoming invites" in `/invites/me`. Albums I've already published are filtered out.
- [backend/app/routers/ratings.py](../../backend/app/routers/ratings.py) — `publish_rating` now also calls `maybe_complete_invites_for_rating`; `delete_rating` now also calls `delete_invites_for_user_album` (regardless of `draft` vs `published`).
- [backend/app/main.py](../../backend/app/main.py) — registered `invites.router` and `invites.listen_later_router`.
- [backend/tests/test_invites.py](../../backend/tests/test_invites.py) — 14 tests covering: create happy-path / non-friend 403 / receiver-already-published 409 / duplicate 409 in both directions; accept only by receiver (sender gets 403); decline deletes; auth required; solo draft has empty `participants`; sending an invite collapses the solo draft into the same row with a participant chip; multi-participant aggregation when several friends share the same album; published albums are excluded from Listen Later; pending incoming invites are not yet in Listen Later; both-publish flips invite to `completed` and seeds the friend dashboard; deleting a rating wipes every related invite.

### Frontend

- [frontend/src/api/invites.ts](../../frontend/src/api/invites.ts) — types (`ListenInvite`, `ListenLaterParticipant`, `ListenLaterEntry`, …) and the five API helpers (`createInvite`, `acceptInvite`, `declineInvite`, `listMyInvites`, `getListenLater`).
- [frontend/src/pages/AlbumInfoPage.tsx](../../frontend/src/pages/AlbumInfoPage.tsx) + [AlbumInfoPage.module.css](../../frontend/src/pages/AlbumInfoPage.module.css) — the new `/albums/:spotifyId` landing page from album search. Header shows the cover (linking out to `https://open.spotify.com/album/{spotify_id}`), title, artist, release date, total track count. Action area is state-driven:
  - no rating yet → **Listen Later** (POSTs a draft and stays here) + **Start Rating** (POSTs a draft and navigates to the editor).
  - existing draft → **Continue Rating** (→ editor).
  - existing published rating → **Rated** (disabled).
  - Plus **Invite a friend** unless already published; opens an inline modal with a search filter over the user's accepted friends. Sending hits `POST /invites`; the backend's 409 detail (already published / already invited) is shown inline next to the friend's row. Successful sends disable the row's button.
  - The track list renders below the header — each row is a hyperlink to the track's Spotify URL.
- [frontend/src/pages/ListenLaterPage.tsx](../../frontend/src/pages/ListenLaterPage.tsx) + [ListenLaterPage.module.css](../../frontend/src/pages/ListenLaterPage.module.css) — single-list view (no tabs). Each row shows album art (links to the info page), title, artist, and either "Solo" or a "Listening with: …" chip list of every participant. Chip colour reflects state: pending invite (amber, with "waiting on them / you"), accepted (blue), the other side has published (green, "published"). Action button is "Continue Rating" (when a draft exists) or "Start Rating" (when only an invite exists).
- [frontend/src/pages/AlbumSearchPage.tsx](../../frontend/src/pages/AlbumSearchPage.tsx) — clicking an album result now navigates to the info page instead of jumping straight to the editor.
- [frontend/src/pages/ProfileDashboardPage.tsx](../../frontend/src/pages/ProfileDashboardPage.tsx) — clicking the album art in a dashboard row routes to the info page (`stopPropagation` so the rest of the row still opens the per-user comparison page).
- [frontend/src/components/NavBar.tsx](../../frontend/src/components/NavBar.tsx) — added a "Listen Later" entry.
- [frontend/src/App.tsx](../../frontend/src/App.tsx) — registered `/listen-later` and `/albums/:spotifyId` routes (both gated by `ProtectedRoute`); the existing `/albums/:spotifyId/rate` editor route is unchanged.

### Plan

- [PLAN.md](../../PLAN.md) — Phase 7 rewritten to reflect the new behavior (single Listen Later list, 409 on invite-of-already-published, withdraw-on-delete, album info page as the new landing from search, dashboard-art rewiring).

## Notes / decisions

- **Single endpoint vs solo/with-friends split**: the original plan called for two tabs and two endpoints. We collapsed both to one because every "with friends" entry already had to carry the user's draft (so the action button could say "Continue rating"), at which point the two endpoints differ only by a participant filter — easier to express that as `participants: list[...]` (empty = solo) on a single endpoint.
- **Withdraw-on-delete via cascade-style cleanup**: rather than nullable FKs or a soft-delete on invites, we just `DELETE FROM listen_invites WHERE album_id = ? AND (sender = me OR receiver = me)` whenever the user deletes their rating. The other side's row is gone too — that matches the user-visible rule "I'm no longer participating, so neither of us is".
- **Pending incoming invites are *not* in Listen Later**: a friend can pile invites on you and they accumulate in `GET /invites/me.incoming` until you accept. This keeps Listen Later honest about "things I'm actually working on" — accepting is the act that puts it in your queue. Alternative considered: include them with a status chip — rejected because then declining requires a separate action surface on the same page, doubling the UI complexity.
- **Block invites when the receiver already published**: the 409 fires on `POST /invites`; we don't try to keep a stale invite valid if someone publishes after a pending invite was created. The flip to `completed` on both-publish covers the other direction.
- **Symmetric participants**: an album with three friends listening collapses to one row with three chips. The query first builds a `participants_by_album` dict from every qualifying invite, then deduplicates album IDs against my drafts so a solo-then-invited album still maps to a single row.
- **Dashboard art vs row click**: the user wanted the art to go to the info page but the existing per-user comparison page is still useful — so we only rewired the `<img>` click (with `stopPropagation`) and left the rest of the row pointing at `/users/:username/albums/:spotifyId`.
- **No new library**: nothing new added this phase. The invite modal is plain CSS + state; the friend list is reused from `GET /friendships/me.accepted`.

## Verification

- `cd backend && uv run alembic upgrade head` → applies `b5d2f4a7e103_add_listen_invites` cleanly.
- `cd backend && uv run pytest` → **79 passed** (65 prior + 14 new).
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` → all green; build at ~470 kB / 157 kB gzip.
- Manual (golden path): alice and bob are friends. From `/albums/{spotify_id}` alice clicks "Listen Later" — row appears under `/listen-later` as Solo. Alice opens "Invite a friend", searches bob, clicks Invite — the same row picks up a "bob (you invited) · waiting on them" chip. Bob logs in: `/invites/me` shows the incoming invite; after accepting, `/listen-later` for both shows the album, alice's chip turns into "accepted" on bob's side. Both publish ratings via the editor — the invite flips to `completed`, the album disappears from both Listen Later pages, and appears on the pair dashboard with the later `completed_at`.
- Manual (edge case): bob publishes his rating without an invite. Alice opens the invite modal — clicking "Invite" on bob shows the inline 409 "bob has already published a rating for this album". Sending a second invite for the same album to the same user returns the duplicate 409.
- Manual (delete): alice has a draft for album X with bob and carol as participants. She clicks Delete in the editor. Both invites are wiped; the row disappears from alice's Listen Later and from bob and carol's Listen Later for that album.
