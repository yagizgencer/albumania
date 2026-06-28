# Phase 10 — Account features & UX fixes

Grab-bag of UX/correctness fixes: email verification (soft gate), login by
email-or-username, a Settings page with change-password, a logout cookie fix,
consistent error/loading UI, unfriend cleanup of listen invites, and
notification deep-links.

## Library / approach choices

- **Email: Resend** (single `httpx` POST) over SMTP (per-env host/creds) and
  SendGrid (extra SDK). With no `RESEND_API_KEY` the service logs to console so
  dev is testable with no account.
- **Verification: soft gate** — users log in unverified but are blocked from
  social actions (friend requests, listen invites) until verified; a banner +
  resend is shown.
- **Change password: current-password-only** (applies immediately + notification
  email) over an email-link confirmation flow.
- **Forms: kept vanilla `useState`** (matches existing Login/Register) rather
  than pulling in react-hook-form/zod for two small forms.

## Backend — files touched

- `app/core/config.py` — added `resend_api_key`, `email_from`, `frontend_base_url`.
- `app/core/security.py` — added `create_email_token` (24h `email_verify` JWT).
- `app/core/deps.py` — added `get_verified_user` dependency (403 if unverified).
- `app/models/user.py` — added `email_verified` boolean column.
- `alembic/versions/f7c1a9e4d210_add_email_verified_to_users.py` — new migration;
  adds the column (default false) and backfills existing users to verified.
- `app/services/email.py` — **new**; Resend client w/ console fallback +
  `send_verification_email` / `send_password_changed_email`.
- `app/schemas/auth.py` — `LoginRequest.email`→`identifier`; added
  `VerifyEmailRequest`, `ChangePasswordRequest`.
- `app/schemas/user.py` — added `email_verified` to `UserResponse`.
- `app/routers/users.py` — populate `email_verified` in `_user_response`.
- `app/routers/auth.py` — login by email-or-username; logout deletes cookie with
  matching attributes (fixes re-login on refresh); register sends verify email;
  new `verify-email`, `resend-verification`, `change-password` endpoints.
- `app/routers/friendships.py` — create gated by `get_verified_user`; unfriend
  now deletes listen invites between the pair (cascades their notifications).
- `app/routers/invites.py` — create gated by `get_verified_user`.
- `.env.example` — documented `RESEND_API_KEY` / `EMAIL_FROM` / `FRONTEND_BASE_URL`.

### Tests
- `tests/test_auth.py` — login-by-username, logout cookie expiry, unverified
  flag, verify-email flow + bad token, resend no-op, social-gate 403/201,
  change-password happy/wrong-current/unauth.
- `tests/test_invites.py` — unfriend removes listen invites + notifications.
- `tests/test_*.py` seed helpers — set `email_verified=True` for users that
  exercise gated endpoints.

## Frontend — files touched

- `src/lib/apiError.ts` — **new**; `getErrorMessage` normalizes axios/FastAPI errors.
- `src/api/auth.ts` — **new**; `login`/`register`/`verifyEmail`/
  `resendVerification`/`changePassword` helpers.
- `src/api/users.ts` — added `email_verified` to `UserProfile`.
- `src/components/Alert.tsx` + `.module.css` — **new**; error/info/success banner.
- `src/components/Spinner.tsx` + `.module.css` — **new**; `LoadingState`.
- `src/components/ErrorBoundary.tsx` + `.module.css` — **new**; render-error fallback.
- `src/components/PasswordInput.tsx` + `.module.css` — **new**; show/hide eye toggle.
- `src/components/VerifyBanner.tsx` — **new**; unverified-email banner + resend.
- `src/components/Icons.tsx` — added `SettingsIcon`.
- `src/components/NavBar.tsx` — added Settings nav item.
- `src/components/NotificationBell.tsx` — `friend_request` deep-links to
  `/friends?tab=incoming`.
- `src/components/ProtectedRoute.tsx` — uses `LoadingState`.
- `src/pages/LoginPage.tsx` — email-or-username field, `PasswordInput`, `Alert`.
- `src/pages/RegisterPage.tsx` — confirm-password, `PasswordInput`, `Alert`.
- `src/pages/SettingsPage.tsx` + `.module.css` — **new**; email status + change password.
- `src/pages/VerifyEmailPage.tsx` — **new**; consumes `?token=` and verifies.
- `src/pages/FriendsPage.tsx` — tab driven by `?tab=` query param; `Alert`/`LoadingState`.
- `src/pages/HomePage.module.css` — larger landing feature titles (1.25rem, bold).
- `src/pages/{HomePage,ProfilePage,AlbumInfoPage,AlbumDetailPage,FriendAlbumDetailPage,ListenLaterPage,ProfileDashboardPage,FriendDashboardPage,RatingEditorPage}.tsx`
  and `src/components/AlbumSearchBar.tsx` — replaced bare `Loading…` / `.error`
  text with `LoadingState` / `Alert`.
- `src/App.tsx` — `/settings` + `/verify-email` routes, `VerifyBanner`, `ErrorBoundary`.

## Verification

- `cd backend && pytest` → 130+ passing (incl. new tests).
- `cd frontend && pnpm exec vitest run && pnpm tsc --noEmit && pnpm build` → all green.
- Manual checklist in the plan: signup/verify, login by username, settings change
  password, logout-then-refresh stays logged out, unfriend clears invites,
  notification → incoming tab.
