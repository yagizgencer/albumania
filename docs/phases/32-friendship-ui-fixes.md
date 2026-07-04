# Phase 32 — Friendship UI fixes

## Problems

Four rough edges in the friends flow:

1. **Unfriending had no in-site warning.** The friends list unfriended with no
   confirmation at all; the profile page used a browser `confirm()` alert (out of
   place vs. the rest of the app, which uses inline confirms like "Remove this
   rating?").
2. **Search for someone who friend-requested me showed "Add".** Clicking it hit
   the "already exists" error path. It should offer Accept / Decline.
3. **A profile of someone who requested me showed only "Accept".** No way to
   decline from their profile.
4. **Adding a user from search made them vanish.** After sending a request the row
   was filtered out; it should stay and read "Requested".

## Fix

- New reusable `ConfirmButton` component that guards a destructive action with an
  inline "<prompt> [confirm] [Cancel]" swap — the same UX as the rating-delete
  flow, no browser dialog. Used for unfriend on both the friends list and the
  profile page.
- The friends page already loads the full friendship list (incoming / outgoing /
  accepted), so each search-result row now derives its state from that list on the
  client (no backend change): **Friends** (label), **Requested** (label),
  **Accept + Decline** (incoming request), or **Add** (default).
- Dropped the `setResults(filter…)` call after sending a request, so the row stays
  and re-derives to "Requested" once the friendship list refreshes.
- Profile page: the received-request state now shows **Accept + Decline** side by
  side; the friends state uses `ConfirmButton` instead of `confirm()`.

## Files touched

- `frontend/src/components/ConfirmButton.tsx` — new: button that swaps to an inline confirmation on first click, then runs the guarded action.
- `frontend/src/components/ConfirmButton.module.css` — new: inline confirm row layout + prompt text style.
- `frontend/src/pages/FriendsPage.tsx` — added `searchState()` deriving a searched user's friendship state from the loaded lists; search rows now render Friends/Requested labels, Accept+Decline, or Add accordingly; `onSend` no longer removes the row; Unfriend now uses `ConfirmButton`.
- `frontend/src/pages/FriendsPage.module.css` — added `.resultStatus` (non-actionable "Requested"/"Friends" label in a search row).
- `frontend/src/pages/ProfilePage.tsx` — `FriendshipButton`: received-request state shows Accept + Decline (imports `declineFriendship`); friends state uses `ConfirmButton` instead of `confirm()`.
- `frontend/src/pages/ProfilePage.module.css` — added `.friendActions` (Accept/Decline row).

## Library / alternatives

No new library. Alternative considered: a shared modal/`<dialog>` confirm. Rejected
— the app's established pattern is an inline confirm swap (album/rating pages), and
reusing that keeps the UX consistent and avoids overlay/focus-trap complexity for a
one-line "are you sure".

Alternative for search-result state: add friendship status to the backend
`/users/search` response. Rejected — the frontend already has the full friendship
list in hand, so deriving it client-side needs no new endpoint/field (keeps to
"one feature at a time, no columns for future use").

## Verification

- `cd frontend && pnpm tsc --noEmit` — clean.
- `cd frontend && pnpm test` — 53 passed.
- `cd frontend && pnpm build` — succeeds.
- No backend changes; `pytest` unaffected.
- Manual (user to confirm): unfriend from list and profile shows inline confirm;
  searching a user who requested you shows Accept/Decline; their profile shows
  Accept + Decline; adding from search keeps the row as "Requested".
