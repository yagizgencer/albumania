# Phase 38 — Per-user Listen Later membership (simplify invite/draft coupling)

## Context

Listen Later membership was derived from **two** sources: your own draft rating,
OR a shared `ListenInvite` row (accepted). Because one invite row was shared by
both users, removing it to clear *your* list also removed the album from the
*friend's* list. The user asked that **removing your copy must not remove the
friend's**, and to simplify the tangled logic.

**New model:** an album is in your Listen Later **iff you have a draft rating for
it** — a single per-user source of truth. The `ListenInvite` row is now purely the
"we're listening together" link, not a membership source.

## Changes (backend only)

- **`accept_invite`** (`routers/invites.py`): after flipping the invite to
  `accepted`, create the receiver's own draft rating if they don't already have one
  for that album. Accepting now puts the album in the receiver's Listen Later
  independently — no manual "start rating" step.
- **`get_listen_later`** (`routers/invites.py`): membership = **my drafts only**.
  Removed the "add a row when an invite is accepted" branch and the now-dead
  no-draft/participant fallbacks; sort is simply by my draft's `started_at`.
  Participant "Listening with:" chips are still derived from invites, but only for
  albums I already have a draft for.
- **`remove_from_listen_later`** / **`delete_rating`**: unchanged — each deletes
  *my* draft and clears the invite link (`delete_invites_for_user_album`). Under
  the new model this is exactly "remove my copy; the friend keeps theirs". Because
  removal clears the invite, the **"Listening with you" tag** naturally disappears
  for both (the tag = an accepted invite exists AND both still have a copy), and
  **either side can re-invite** afterward.

No schema/migration change. No frontend change — membership is derived server-side,
so the UI (Rate/Remove buttons, participant chips) works as-is. Start/Continue was
already unified to "Rate" in phase 36.

## Why this is simpler

One rule — "it's in my list iff I have a draft" — replaces the draft-OR-shared-
invite derivation. Removal, re-invite, and the shared-listen tag all fall out of
that single rule instead of special-casing the shared invite row.

## Files touched

### Backend
- `backend/app/routers/invites.py` — `accept_invite` creates the receiver's draft; `get_listen_later` membership is draft-only (removed the accepted-invite row branch + dead fallbacks; simplified sort).
- `backend/tests/test_invites.py` — `_publish` helper reuses an existing draft (accept now makes one); updated `test_reinvite_allowed_after_receiver_removes_album` (remove via `DELETE /listen-later`); new `test_accept_invite_creates_receiver_draft` and `test_remove_my_copy_keeps_friends_copy` (the headline fix).

## Verification

- Backend: `cd backend && pytest` — 192 passed (+2 net; notification/dashboard flows unchanged).
- Frontend: `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — green (66 tests, no changes).
- Manual (user to confirm) at `localhost:5173`:
  1. alice invites bob → bob accepts → both see the album with "Rate" + the
     "Listening with:" chip.
  2. bob removes it → gone for bob; **alice still has it** (now solo, chip gone).
  3. Either can invite again afterward; on accept the chip returns, both keep drafts.
  4. Both publishing still completes the invite and fills the pair dashboard.
