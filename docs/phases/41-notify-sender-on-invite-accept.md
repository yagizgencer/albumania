# Phase 41 — Notify the sender when their listen invite is accepted

## The gap

When you sent a "listen together" invite and the friend accepted it, you (the
sender) got **no notification**. `accept_invite` flipped the status, created both
drafts, and marked the *accepter's* own invite notification read — but never told
the sender. (Friendships already do this via `friend_accept`; listen invites had no
equivalent.)

## Fix

Added a new notification type **`listen_invite_accepted`** and, in `accept_invite`,
create one for the sender ("bob accepted your listen invite") — mirroring the
`friend_accept` pattern. It carries the album, so clicking it opens the album page
(Listen Later fallback), and counts toward the bell badge.

## Files touched

### Backend
- `backend/app/models/notification.py` — new `NotificationType.listen_invite_accepted`.
- `backend/alembic/versions/0e7e7d365ca1_add_listen_invite_accepted_notification_type.py` —
  migration adding the enum value on Postgres (`ALTER TYPE … ADD VALUE IF NOT
  EXISTS`); no-op on SQLite. Mirrors the earlier `comment_liked` add. Head is now
  `0e7e7d365ca1`.
- `backend/app/routers/invites.py` — `accept_invite` calls `create_notification`
  for the sender with the new type (actor = accepter, album_id set).
- `backend/tests/test_notifications.py` — `test_accepting_invite_notifies_sender`
  (sender gets exactly one `listen_invite_accepted` from the accepter; counts
  toward the bell).

### Frontend
- `frontend/src/api/notifications.ts` — added `listen_invite_accepted` to the
  `NotificationType` union.
- `frontend/src/components/NotificationBell.tsx` — label
  ("{actor} accepted your listen invite") + `linkFor` case (album page, Listen
  Later fallback). The exhaustive `Record`/`switch` mean TS enforces this new case.

## Verification

- Backend: `cd backend && pytest` — 194 passed (+1). `alembic upgrade head` applied
  cleanly (Postgres dev DB).
- Frontend: `pnpm test && pnpm tsc --noEmit && pnpm build` — green (66 tests).
- Manual (user to confirm): send a listen invite; when the friend accepts, your
  bell shows "{friend} accepted your listen invite".
