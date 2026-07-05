# Phase 39 — Accepting an invite creates a draft for BOTH users

## The bug

You invited a friend, they accepted, their screen showed "listening with you" —
but the album never appeared in **your** Listen Later.

**Root cause:** `accept_invite` created a draft rating only for the **invitee**
(the person clicking accept), not for the **inviter**. Since Listen Later
membership is "I have a draft" (phase 38), the inviter had nothing, so the album
wasn't in their list — while the invitee's accepted invite made them show the
inviter as a participant. Pure asymmetry.

## The model (locked in with the user)

Two tables, `rating` and `invite`. **An album is in my Listen Later ⇔ I have a
draft rating for it.**

A draft is created either by (1) clicking "Rate"/"Listen Later", or (2) **accepting
an invite — which creates a draft for BOTH the inviter and the invitee** (if they
don't already have one).

- **Send** → invite row only; no draft for anyone; not in any list.
- **Accept** → draft for both; album in both lists with the "listening with" chip.
- **Decline/cancel** → invite deleted; nobody's list changes.
- **Delete/remove my rating** → also deletes the invite tied to it (link gone,
  either can re-invite), but **never** the other person's rating; their album stays
  (now solo).
- **Who I can invite** → anyone who hasn't **published** the album, with no existing
  invite between us. Having it in Listen Later (a draft) on either side is fine.

## The fix (one change)

`accept_invite` (`backend/app/routers/invites.py`): after flipping the invite to
`accepted`, loop over **both** `invite.sender_username` and
`invite.receiver_username` and create a draft rating for each that doesn't already
have one. Previously only the accepter got a draft.

Everything else already matched the model (audited): `create_invite` (blocks only
on receiver-published + duplicate; no draft on send), `decline`/`cancel`,
`delete_rating` → `delete_invites_for_user_album` (deletes my rating + my invites,
never the other's), `remove_from_listen_later`, and `get_listen_later`
(membership = my drafts). No new endpoint, no schema change, no frontend change.

## Files touched

- `backend/app/routers/invites.py` — `accept_invite` creates a draft for both parties.
- `backend/tests/test_invites.py`:
  - `test_accept_creates_draft_for_both` (renamed/expanded from the receiver-only
    test) — asserts both sender and receiver get the album + chip after accept, and
    that sending alone puts it in nobody's list.
  - `test_receiver_removes_shared_album_sender_keeps_it` (rewritten from the old
    `test_remove_accepted_invite_with_no_draft`, whose premise is now impossible) —
    sender got her draft purely from the accept; receiver removing keeps sender's
    copy (solo, invite gone).
- `backend/tests/test_notifications.py` — `_publish` helper reuses an existing draft
  (the publisher may already have one from accepting) instead of always `POST /ratings`.

## Verification

- Backend: `cd backend && pytest` — 192 passed.
- Frontend: `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — green (66 tests, no code changes).
- Manual (user to confirm) at `localhost:5173`:
  1. alice invites bob → alice's list unchanged, invite under "outgoing".
  2. bob accepts → album in **both** lists, each with "Rate" + "listening with" chip.
  3. bob removes → gone for bob; **still in alice's list** (solo, chip gone); either
     can re-invite.
  4. decline → nobody's list changes.
  5. both publish → invite completes, pair dashboard fills.
