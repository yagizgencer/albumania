# Phase 42 — Remove the "Private" profile-visibility option

## Context

A profile can now be only **Public** or **Friends only** — the "Private" option is
removed everywhere. No user was private (dev DB: 5 public, 1 friends), so this is a
**full removal**: the `private` value is dropped from the `ProfileVisibility` enum,
every code branch that handled it is deleted, and the Postgres enum type is
recreated without the value.

**Not touched:** `CommentVisibility.private` is a **separate** enum for comments —
comments keep their private option.

## Backend

- `models/user.py` — dropped `private` from `ProfileVisibility` (default stays
  `public`).
- Removed the 5 `ProfileVisibility.private` branches:
  - `routers/users.py` `require_can_view_profile` — dropped the private→403 branch
    (access is now: owner ok; friends-only + not friend → 403; public ok).
  - `routers/friendships.py` `get_friend_dashboard` — dropped the "other went
    private" guard (can't happen).
  - `routers/home.py` — dropped the `private_friends` filter; every feed user's
    ratings now show to friends. (Comment `CommentVisibility.private` check kept.)
  - `routers/albums.py` and `routers/invites.py` — dropped the
    `profile_visibility != private` filters from the friend-ratings / they_published
    queries.
- **Migration** `55e71d136ad0_remove_private_profile_visibility.py`: first
  `UPDATE users SET profile_visibility='friends' WHERE …='private'` (all dialects,
  prod safety), then on Postgres recreate the `profilevisibility` enum without
  `private` (rename old → create new `('public','friends')` → alter column with
  cast → reset default → drop old). SQLite is plain VARCHAR, so only the UPDATE
  runs. Downgrade re-adds the `private` label (data not restored). Verified
  upgrade→downgrade→upgrade round-trips; enum labels end as `{public, friends}`.

## Frontend

- `api/users.ts` + `api/friendships.ts` — `ProfileVisibility` union → `"public" | "friends"`.
- `pages/SettingsPage.tsx` — removed the "Private" `<option>`.
- `pages/FriendsPage.tsx` — non-public pill is always "🔒 Friends".
- `pages/ProfilePage.tsx` — `AccessBlock` → `"friends-only" | null`; header pill
  simplified to "Friends only"; `PrivateNotice` reduced to the friends-only case;
  dropped `isPrivate` from the friend-combobox (no more per-friend lock icon).
- `pages/ProfileDashboardPage.tsx` — 403 handler always means friends-only;
  `onAccessBlocked` type narrowed to `"friends-only" | null`.
- `pages/FriendDashboardPage.tsx` — 403 uses the generic access message.
- Removed the now-unused `.comboLock` CSS. TypeScript's exhaustive unions confirmed
  no stray `"private"` remained.

## Tests

- Backend: rewrote/removed the private-specific tests across `test_users`,
  `test_friendships`, `test_dashboard`, `test_friend_dashboard`, `test_home`,
  `test_albums`, `test_invites`, `test_user_comparison` — private→403 / private-hides
  cases became friends-only equivalents or were dropped (already covered). Left all
  `CommentVisibility.private` tests untouched.
- Frontend: `SettingsPage.test.tsx` now exercises "friends" instead of "private".

## Verification

- Backend: `pytest` — 190 passed. `alembic upgrade head` / `downgrade` round-trip
  clean; `SELECT` shows no `private` rows and enum labels `{public, friends}`.
- Frontend: `pnpm test && pnpm tsc --noEmit && pnpm build` — green (66 tests).
- Manual (user to confirm): Settings shows only Public / Friends only; a friends-only
  profile is hidden from non-friends and visible to friends; no "Private" anywhere.

## Prod note

Run `alembic upgrade head` on **Neon** at deploy. The migration self-heals any
stray `private` user → `friends` before recreating the enum, so it won't fail —
but the enum recreate must run before the new code writes `friends`-only values.
Flag in the PR.
