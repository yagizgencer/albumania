# Phase 37 — Remove any Listen Later entry + center "Rate"

## Context

When an invite is accepted, the album appears in both users' Listen Later with a
"Rate" button — but the **Remove** button only showed once that user had started a
draft rating. So an accepted-invite row with no draft yet couldn't be removed.
Remove should always be available. Also, the "Rate" button's label wasn't centered.

Root cause: removal was implemented as `deleteRating(entry.rating.id)`, which
requires a draft. An accepted-invite entry with no draft has no rating to delete,
so the button was hidden.

## Backend

New **`DELETE /listen-later/{album_id}`** (`routers/invites.py`): removes an album
from my Listen Later regardless of how it got there — deletes my *draft* rating for
it (if any) and withdraws me from every invite for it (both directions) via the
existing `delete_invites_for_user_album` (`services/invite.py`). Published ratings
are left untouched (they aren't Listen Later items). 404 if the album isn't in my
Listen Later (no draft and no invite). This mirrors the existing rating-delete →
withdraw-invites path, so the other participant loses the shared-listen row too —
consistent with how removal already behaved for draft entries.

## Frontend

- `api/invites.ts`: `removeFromListenLater(albumId)`.
- `pages/ListenLaterPage.tsx`: the row's **Remove** button always renders; on
  confirm it calls `removeFromListenLater(entry.album.id)` (was
  `deleteRating(entry.rating.id)`, which needed a draft).
- `pages/ListenLaterPage.module.css`: `.action` (the "Rate" link, a full-width
  `<a>` in a stretched column) gets `text-align: center`.

## Files touched

### Backend
- `backend/app/routers/invites.py` — new `DELETE /listen-later/{album_id}`; import `delete_invites_for_user_album`.
- `backend/tests/test_invites.py` — 4 new tests: remove accepted-invite-no-draft (withdraws both sides), remove draft-only, 404 when absent, auth.

### Frontend
- `frontend/src/api/invites.ts` — `removeFromListenLater`.
- `frontend/src/pages/ListenLaterPage.tsx` — always-visible Remove; use the new endpoint.
- `frontend/src/pages/ListenLaterPage.module.css` — center the "Rate" label.
- `frontend/src/pages/ListenLaterPage.test.tsx` — updated removal test to the new endpoint; new test that an accepted-invite entry with no draft shows Remove.

## Library / alternatives

No new library. Alternative considered: expose invite ids on Listen Later
participants and delete the specific accepted invite from the client. Rejected —
an album-scoped `DELETE /listen-later/{album_id}` is simpler, matches the existing
`delete_invites_for_user_album` semantics, and handles draft + invite in one call
without leaking invite ids to the frontend.

## Verification

- Backend: `cd backend && pytest` — 190 passed (+4 new).
- Frontend: `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — green (66 tests).
- Manual (user to confirm) at `localhost:5173`:
  1. Accept an invite (don't start rating) → the row shows both "Rate" and
     "Remove"; Remove works and the album disappears for both users.
  2. A draft entry still removes as before.
  3. The "Rate" button label is centered.
