# Phase 40 — Notify both parties when each finishes a shared listen

## The bug

A and B listen to an album together (accepted invite). A publishes → B gets a
"friend finished rating" notification. But when B then publishes, **A gets no
notification** — even though A should be told "B has now finished too".

## Root cause

`maybe_complete_invites_for_rating` (`backend/app/services/invite.py`, run on every
publish) only sent the `friend_published` notification in the branch where the
**other party had NOT yet published** ("your turn"). When the *second* person
published, the code took the other branch — it flipped the invite to `completed`
and rebuilt the dashboard, but **notified no one**. So the first publisher never
learned the second had finished.

## Fix

Restructured the per-invite loop so that, for every **accepted** invite involving
the publisher, the other party is **always** notified that the publisher finished —
then, additionally, if the other party had already published, the invite is
completed and the pair dashboard rebuilt. Pending (non-accepted) invites still
notify no one.

Net effect: whoever publishes first notifies the second ("your turn"), and whoever
publishes second notifies the first ("they've finished too"). Each side gets
exactly one notification.

## Files touched

- `backend/app/services/invite.py` — `maybe_complete_invites_for_rating`: send the
  `friend_published` notification for accepted invites in both the
  still-pending-other-side and now-completing cases; guard the whole body on
  `status == accepted`.
- `backend/tests/test_notifications.py` — new `test_second_publisher_also_notifies_first`
  (A publishes, then B publishes → A gets exactly one `friend_published` from B).

## Verification

- Backend: `cd backend && pytest` — 193 passed (+1 new; existing
  `test_friend_published_notifies_other_party` and
  `test_both_publish_marks_invite_completed_and_creates_friend_dashboard_entry`
  still green).
- Frontend: `pnpm test && pnpm tsc --noEmit` — green (66 tests, no change; the bell
  already renders `friend_published` as "X finished rating an album you're both
  listening to").
- Manual (user to confirm): A and B accept a shared listen; A publishes → B
  notified; B publishes → **A now notified** too.
