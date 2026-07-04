# Phase 34 — Social polish & fixes

Four focused fixes. A fifth request — "Compare with you" on any *viewable*
(non-friend) profile — is deferred to its own phase: the whole comparison feature
is keyed on a `Friendship` row + a precomputed `friend_dashboard_entries` table,
so comparing with a non-friend needs a new username-based endpoint that computes
the comparison live. Tracked separately.

## 1. Register: username hint + error text

- Removed the always-on "5–20 characters: letters, numbers, . and _" helper under
  the username field.
- Rewrote the validation messages to be natural and compact (dropped the LLM-ish
  "— no spaces or symbols" dash clause):
  - too short → "A bit short — use at least 5 characters."
  - too long → "A bit long — keep it under 20 characters."
  - bad chars → "Use only letters, numbers, dots, and underscores."

## 2. Action-specific "verify your email" message

The email-verification gate was one generic `get_verified_user` dependency raising
"Verify your email to do this". Replaced it with a `require_verified_email(action)`
factory that raises **"You should verify your email to \<action\>."** Call sites:
- `POST /friendships` → "…to send friend requests."
- `POST /invites` → "…to send listen invites."

The frontend already surfaces the backend `detail`, so no frontend change needed.

## 3. "Friendship not found" on a (public) profile

**Bug:** `compareFriendshipId` is persisted per-profile in sessionStorage, so it
could hold a **stale** friendship id — e.g. after unfriending and re-friending (a
new friendship row with a new id) — which made `FriendDashboard` 404 with
"Friendship not found". The user's workaround (toggle Compare on/off) reset the id
to the current friendship. A public profile's solo dashboard should show
regardless of friendship, so a stale id should just fall back to it.

**Fix (ProfilePage):**
- Added a reconciliation effect: once friendships load, if `compareFriendshipId`
  isn't the id of the *current* accepted friendship with this profile, reset it to
  `null` (→ solo dashboard).
- Gated the `FriendDashboard` render on `friendState.kind === "friends"` **and**
  the id matching, so a stale/not-yet-loaded id never renders a 404 dashboard —
  it shows the solo dashboard instead.

## 4. Keep notifications after declining

**Bug:** friend-request / listen-invite notifications have an `ON DELETE CASCADE`
FK to the friendship/invite row. **Declining** deleted that row, so the cascade
wiped the notification. The user wants declined requests/invites to stay in
history.

**Fix:** new `resolve_notifications(db, friendship_id=/invite_id=)` service helper
that **nulls the FK and marks the notification read** before the row is deleted.
The notification survives the cascade (it still renders from type + actor + album)
and no longer counts toward the badge. Wired into `decline_friendship` and
`decline_invite`. (Cancelling your *own* pending request still cascades away, as
before — that's `DELETE /friendships/{id}`, unchanged.)

## Files touched

### Frontend
- `frontend/src/pages/RegisterPage.tsx` — removed the username helper `<small>`.
- `frontend/src/lib/validation.ts` — natural/compact username error messages.
- `frontend/src/lib/validation.test.ts` — updated the "too long" assertion to match new wording.
- `frontend/src/pages/ProfilePage.tsx` — reconcile a stale `compareFriendshipId` to `null`; gate `FriendDashboard` on a valid, matching accepted friendship.

### Backend
- `backend/app/core/deps.py` — replaced `get_verified_user` with `require_verified_email(action)` factory (action-specific 403 message).
- `backend/app/routers/friendships.py` — use the factory ("send friend requests"); call `resolve_notifications` before deleting on decline.
- `backend/app/routers/invites.py` — use the factory ("send listen invites"); call `resolve_notifications` before deleting on decline.
- `backend/app/services/notifications.py` — new `resolve_notifications` helper (detach FK + mark read).
- `backend/tests/test_friendships.py` — added the unverified→action-message test.
- `backend/tests/test_notifications.py` — added tests that declining a friend request / listen invite keeps the notification (read, FK nulled).

## Library / alternatives

No new library; no schema/migration change (item 4 reuses the nullable FK columns
and the existing `read` flag). Alternative for item 4 considered: add a `declined`
status to friendships/invites and keep the rows. Rejected — it ripples through
duplicate-checks, listings, and the dashboard-rebuild logic; nulling the
notification FK is a smaller, local change that matches the model's stated intent
("we never delete rows just because the user dismissed them").

## Verification

- `cd backend && pytest` — 176 passed (was 173; +3 new).
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green (60 tests).
- Manual (user to confirm): register form shows no default hint and a natural error;
  an unverified account sees "You should verify your email to send friend
  requests/listen invites."; a public friend's profile shows their dashboard
  immediately (no "Friendship not found"); declining a request/invite keeps the
  notification in the bell (read).

## Deferred

- **Item 5** — "Compare with you" on any viewable (public/friends-only) non-friend
  profile. Needs a new live comparison path (username-based, no friendship row /
  precomputed table). Its own phase.
