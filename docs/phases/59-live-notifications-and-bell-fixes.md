# Phase 59 — Notifications only appeared after a page refresh

## Why

A user reported that a friend request only showed up after refreshing the page. Auditing
all six notification types end to end turned up four distinct problems, only one of which
was the polling interval.

**1. The pages never refetched — the actual cause.** `FriendsPage` called
`listFriendships()` once on mount and then only after the user's *own* mutations. Nothing
connected the badge poll to the page data, so a request arriving while you sat on
`/friends` never appeared. `ProfilePage`'s friendship effect was keyed on `[username]` only
and had the same hole. A reload really was the only way to see it.

**2. Badges polled every 60s**, so even the bell count lagged by up to a minute.

**3. The bell's unread highlight was unreachable.** `handleToggle` awaited
`markSeen("bell")` *before* `listNotifications()`. `mark_seen` flips every unread row to
`read=True` and commits, so the list always came back fully read and `bellItemUnread` could
never render — you opened the bell and could not tell what was new. This affected all six
types.

**4. Opening the bell destroyed notifications the user had never seen.** `mark_seen` marked
rows read and then called `prune_read_notifications`, which hard-deletes all but the
`READ_RETENTION = 10` newest *read* rows. A row could therefore be deleted by the very
request that first made it prunable: with 35 unread you saw the newest 30, all 35 were
marked read, and the 5 oldest were deleted unseen. Unread rows were otherwise safe — the
prune filters `read.is_(True)` — so the read transition was the only place data was lost.

Plus a latent ordering bug: `created_at` is `server_default=func.now()`, which on Postgres
is *transaction start time*, so rows written in one transaction (several `friend_published`
at once) tie. Both the list and the prune ordered by `created_at DESC` with no tiebreak, so
their order was arbitrary and the prune could drop a newer row over an older one.

## Why not SSE / WebSockets

Considered and deferred. `create_notification` is a single chokepoint all six creation paths
converge on, and production runs exactly one uvicorn worker, so an in-process asyncio broker
would be coherent without Redis. But:

- Every endpoint is a sync `def` on anyio's 40-thread pool with a 40-connection ceiling
  (`db/session.py` documents a prior outage from exactly this). An SSE endpoint would have
  to be `async def` and avoid `get_db` entirely, or N viewers deadlock the API at N≈40.
- `create_notification` runs in worker threads, so publishing into an asyncio broker needs
  `loop.call_soon_threadsafe` plus post-commit ordering.
- Auth is header-only Bearer with a 15-minute TTL; `EventSource` cannot set headers, so it
  needs a new auth path or a fetch-`ReadableStream` client with its own reconnect logic.

That is the app's first long-lived-connection concurrency model, for a badge count. Fixing
the refetch gap gets the same perceived result for a fraction of the risk.

**Also deliberately out of scope:** the bell still fetches `limit=30`, so with retention at
200 rows 31–200 are preserved but not browsable. Making them reachable needs an
offset/cursor param and a "Show older" control — a separate phase. The point here is that
the data survives.

## Retention sizing

An all-in notification row costs roughly 320 bytes: ~100 B of heap plus ~215 B spread across
this table's nine indexes. So 200 rows is ~64 KB per user — 10,000 notifications is ~3 MB,
100,000 is ~32 MB. Nothing loads them into memory either: `summary_counts` is a SQL
`GROUP BY` and the list has `LIMIT 30`, both index-covered per recipient. The cap exists to
stop one pathological account growing without bound, not to trim history. The conventional
alternative — an age-based retention job — needs a background worker, which CLAUDE.md rules
out.

## Verified as *not* broken

Checked during the audit and deliberately left alone: duplicate `friend_published` on
republish is guarded (`ratings.py` 409s on double-publish; republish skips the notify);
repeat `comment_liked` is deduped against an existing unread row; FK `ondelete` on
actor/recipient is moot with no account-deletion endpoint; unfriend cascading away
notifications is documented intent on the model; and `friend_accept` /
`listen_invite_accepted` / `friend_published` / `comment_liked` being bell-only is
consistent between `summary_counts` and the `mark_seen` scopes.

No new model and no schema change, so **no migration**.

## Files touched

### Backend

- `app/services/notifications.py` — `READ_RETENTION` 10 → 200 with the sizing rationale;
  moved `prune_read_notifications` to the *start* of `mark_seen` so it only ever considers
  rows already read before this call; added `Notification.id.desc()` as a prune tiebreak.
- `app/routers/notifications.py` — same `id.desc()` tiebreak on the list `order_by`.
- `tests/test_notifications.py` — prune test now passes an explicit `keep`; new
  `test_default_retention_keeps_ordinary_history`,
  `test_mark_seen_never_deletes_what_it_marks_read` (35 unread survive a bell open), and
  `test_list_breaks_created_at_ties_by_id`.

### Frontend

- `src/context/NotificationsContext.tsx` — poll 60s → 25s (the `visibilityState` guard, not
  the interval, is what protects background tabs); added a `version` counter that bumps only
  when the polled `bell` count *increases*, so pages can subscribe to "something new
  arrived" without refetching in response to the user's own dismissals; compared via a
  `useRef` since StrictMode double-invokes updaters; `markSeen` keeps that ref in step; the
  summary object identity is preserved when counts are unchanged.
- `src/context/NotificationsContext.test.tsx` — new: polls at 25s, bumps on 0→1, holds on
  2→1 and on unchanged.
- `src/components/NotificationBell.tsx` — fetch the list *before* marking seen so unread
  items render as unread; wrapped the items in a `.bellList` scroll container.
- `src/components/NavBar.module.css` — scrolling moved from `.bellPanel` to a new
  `.bellList` capped at `min(60vh, 24rem)`, so the header stays pinned and 30 items read as
  a dropdown rather than a full-height panel.
- `src/components/NotificationBell.test.tsx` — hoisted stable context mocks; new case
  asserting the unread class renders and that `listNotifications` is called before
  `markSeen`.
- `src/pages/FriendsPage.tsx` — load effect keyed on `version` instead of mount-only;
  accept/decline/remove now also call the context `refresh()` so the nav badge resyncs
  immediately; marks `friend_requests` seen on mount, since arriving via the bell's link
  previously left the badge lit over an empty list.
- `src/pages/ProfilePage.tsx` — separate `version`-keyed effect calling `reloadFriendships()`
  only; kept out of the `[username]` effect, which also resets profile/editing state.
- `src/components/NavBar.test.tsx`, `src/pages/ProfilePage.test.tsx` — context mocks updated
  for the new `version` field (`ProfilePage` had no `NotificationsContext` mock at all and
  would have thrown once it started consuming the hook).

## Verification

- `cd backend && uv run pytest` — 251 passed.
- `cd frontend && pnpm test` — 99 passed across 24 files; `pnpm tsc --noEmit` and
  `pnpm build` both clean.
- Manual: see the browser checks in the phase plan — two accounts, one sitting on `/friends`
  and on the other's profile while a request arrives.
