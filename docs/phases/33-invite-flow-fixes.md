# Phase 33 — Invite flow fixes

## Problems

1. **Invite modal closed immediately after sending**, so the friend you just
   invited vanished and appeared invitable again. It also only surfaced
   "already invited" / "already rated" as an error *after* a failed click, with no
   proactive greying-out and no distinction between the two cases.
2. **The album page offered "Listen Later" even when an invite was already
   active** (you invited someone, or you accepted an incoming invite). In that
   state the album is already a committed shared listen, so it should offer
   "Continue Rating", not a fresh "Listen Later".

## Fix

All frontend — the needed state comes from two endpoints the app already has:

- `listMyInvites()` → my still-pending **outgoing** invites (these don't appear in
  Listen Later until the receiver accepts).
- `getListenLater()` → this album's **accepted** participants (a committed shared
  listen, either direction).

**Album page buttons.** `AlbumInfoPage` now loads invite state for the current
album and derives `hasActiveInvite` (a pending outgoing invite, or any accepted
invite). When true and the user has no rating yet, it shows **Continue Rating**
(→ `/rate`, which shows a Start button if there's no draft) instead of
**Listen Later + Start Rating**. Draft ratings still show Continue Rating as before.

**Invite modal.** After a successful send the modal stays open and the friend
stays in the list, disabled and labelled **"Invited"** (instead of closing). The
modal is also pre-seeded with two sets from the album page:
- `alreadyInvited` (pending outgoing invitees) → disabled, "Invited",
  "Invite already sent".
- `alreadyRated` (friends who published, from `getAlbumFriendRatings`) → disabled,
  "Rated", "Already rated this album".

The backend already rejects both cases with distinct 409s, so those remain the
real gate; the greying-out is the friendly front-end mirror. (`getAlbumFriendRatings`
is published-only and hides private friends, so a private friend who rated still
gets caught server-side and shown as a per-friend error.)

## Files touched

- `frontend/src/pages/AlbumInfoPage.tsx` — load per-album invite state via `listMyInvites` + `getListenLater` (`loadInviteState`); add `pendingInvitees`/`participants` state and `hasActiveInvite`; swap Listen Later/Start Rating for Continue Rating when an invite is active; keep the invite modal open on send (refresh invite state instead); pass `alreadyInvited`/`alreadyRated` into `InviteModal`; render distinct disabled labels ("Invited"/"Rated") with a reason note.
- `frontend/src/pages/AlbumInfoPage.module.css` — added `.friendNote` (muted reason under a greyed-out friend).
- `frontend/src/pages/AlbumInfoPage.test.tsx` — mock the two new invite endpoints; added 3 tests: Listen Later + Start Rating when unrated/no invite; Continue Rating (no Listen Later) when an accepted invite exists; a friend with a pending invite shows a disabled "Invited" button.

## Library / alternatives

No new library, no backend change. Alternative considered: a dedicated
`GET /invites/me/album/{id}` endpoint for per-album invite state. Rejected —
`listMyInvites` + `getListenLater` already return everything needed, so a new
endpoint would be scope the phase didn't ask for (CLAUDE.md: "one feature at a
time, don't add endpoints for future use"). Trade-off: `getListenLater` fetches
the whole list to look up one album; acceptable for a page load and avoids new
backend surface.

## Verification

- `cd frontend && pnpm tsc --noEmit` — clean.
- `cd frontend && pnpm test` — 56 passed (was 53; +3 new).
- `cd frontend && pnpm build` — succeeds.
- No backend changes; `pytest` unaffected.
- Manual (user to confirm): invite a friend → modal stays open, friend shows
  "Invited" (disabled); a friend who already rated shows "Rated" (disabled); on an
  album with an accepted/outgoing invite the page shows "Continue Rating" and no
  "Listen Later".
