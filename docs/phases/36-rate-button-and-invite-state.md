# Phase 36 — Unify "Rate" button & fix invite modal accepted-state

## Context

Two related UX fixes:

1. **"Start Rating" / "Continue Rating" → just "Rate".** They were split by whether
   a draft existed, and clicking "Start Rating" navigated to the editor which then
   showed a *second* gate ("You haven't rated this album yet" + another button)
   before you could rate. Now a single **"Rate"** action everywhere takes you
   straight into the editor, which creates the draft on arrival if you don't have
   one.
2. **A friend I've already invited (or who accepted) was still clickable in the
   invite modal**, only erroring on click. Now they're greyed out and
   unclickable with a clear reason. Edge case handled: if I invited them, they
   accepted, then the album left their Listen Later and they re-added it solo,
   we're no longer listening together — so I can invite again.

## Part 1 — Unify to "Rate"

- `pages/RatingEditorPage.tsx`: the load effect now **auto-creates the draft** when
  there's no rating (try `getMyRatingForAlbum`; on 404 `createRating`; on a 409
  create-race re-fetch). Removed the `startBox` / "Start Rating" gate and
  `handleStartRating`. Removed the now-unused `.startBox` CSS.
- `pages/AlbumInfoPage.tsx`: collapsed the draft / no-draft / active-invite
  branches into a single **"Rate"** button (`handleRate` → navigate to `/rate`).
  "Listen Later" stays only when `!rating && !hasActiveInvite`. Dropped
  `handleStartRating` and the now-unused `isDraft`.
- `pages/ListenLaterPage.tsx`: the row action link is always **"Rate"**.

## Part 2 — Grey out already-invited / listening friends

Backend was already correct — no logic change:
- `create_invite` rejects a duplicate only when an invite row actually exists.
- `delete_rating` → `delete_invites_for_user_album` (`services/invite.py`) removes
  the invite (both directions) when either party deletes their rating, so
  remove+re-add clears it and re-invite is allowed.

The gap was frontend: the modal never received the **accepted** invites.
- `pages/AlbumInfoPage.tsx`: passes `listeningWith` (accepted participants from
  `getListenLater()`) into `InviteModal`.
- `InviteModal`: new `listeningWith` prop; per-friend precedence is now
  **Rated → Listening → Invited you → Invited → Invite**. The accepted case shows
  a disabled **"Listening"** button with note **"Already listening with you"**.
  Once the album is removed (participant/invite gone), the friend's button returns
  to an enabled "Invite" — the desired re-invite behavior, no extra code.

## Files touched

### Frontend
- `frontend/src/pages/RatingEditorPage.tsx` — auto-create draft on load; remove start gate.
- `frontend/src/pages/RatingEditorPage.module.css` — drop unused `.startBox`.
- `frontend/src/pages/AlbumInfoPage.tsx` — single "Rate" button; `listeningWith` into the modal; new "Listening" greyed state.
- `frontend/src/pages/ListenLaterPage.tsx` — "Rate" label.
- `frontend/src/pages/AlbumInfoPage.test.tsx` — updated Rate assertions; new "Listening" disabled test.
- `frontend/src/pages/ListenLaterPage.test.tsx` — assert the "Rate" link.

### Backend
- `backend/tests/test_invites.py` — new `test_reinvite_allowed_after_receiver_removes_album` (full loop: invite → accept → 409 while active → receiver removes → re-invite 201 → re-accept 200).

## Library / alternatives

No new library, no backend logic change. Alternative for Part 1 considered:
keep a "Start Rating" button that pre-creates before navigating. Rejected — moving
the create into the editor's load removes the extra screen and unifies the label,
and the editor already had all the pieces (`createRating`, `applyRating`).
Alternative for Part 2: add an "accepted invites" field to a backend endpoint.
Rejected — `getListenLater()` already returns accepted participants; the modal
just needed to consume them.

## Verification

- Backend: `cd backend && pytest` — 186 passed (+1 new).
- Frontend: `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — green (65 tests).
- Manual (user to confirm) at `localhost:5173`:
  1. Album with no draft → "Rate" lands directly in the editor (no extra gate);
     draft/active-invite albums also show "Rate".
  2. Invite bob → greyed "Invited"; after he accepts → greyed "Listening".
  3. bob removes the album and re-adds solo → "listening with you" tag gone, I can
     invite him again; on re-accept his draft is kept and the tag returns.
