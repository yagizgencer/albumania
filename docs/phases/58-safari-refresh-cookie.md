# Phase 58 — Safari logged out on every refresh (third-party cookie)

## Why

A tester reported being logged out every time she refreshed the page — 3/3 attempts, on
Safari. It was not reproducible in Chrome on the same live site, and not reproducible
locally at all.

**The refresh cookie was a third-party cookie, and Safari blocks those by default.**

Production served the SPA from `albumania.net` (Vercel) and the API from
`albumania-api.onrender.com` (Render). Different registrable sites, so the `refresh_token`
cookie the API set was third-party. `auth.py` compensated with `SameSite=None; Secure`:

```python
# SameSite=None is required for cross-site cookies (Vercel → Render).
return {"httponly": True, "samesite": "none" if secure else "lax", "secure": secure}
```

`SameSite=None` only works if the browser *permits* third-party cookies. Safari has
"Prevent Cross-Site Tracking" on by default and refuses to **store** the cookie at all.

The failing sequence:

1. `POST /auth/login` succeeds; the access token lands in memory (never persisted).
   Safari silently drops the `Set-Cookie`. The app looks logged in.
2. Refresh the page → in-memory token is gone.
3. `AuthContext` bootstraps with `POST /auth/refresh`. No cookie is sent.
4. `401 "No refresh token"` → logged out. Every time.

Chrome and Edge still allow third-party cookies, so the owner could not reproduce it.
Local dev could not reproduce it either — `localhost:5173` and `localhost:8000` are the
*same site*, so the cookie is first-party there regardless of `SameSite`. **The bug was
invisible in both environments it was developed in.**

Two secondary bugs in the same path were fixed alongside it:

- **The refresh cookie was a session cookie.** No `max_age`/`expires` was ever set, so it
  died when the browser quit — despite holding a 30-day JWT. "Stay logged in for 30 days"
  actually meant "until you close your browser".
- **One transient failure permanently ended a session.** `AuthContext` dropped its
  `albumania.hasSession` localStorage hint on *any* refresh rejection — a timeout, an
  offline blip, a CORS error. Once dropped, the mount effect skipped the refresh entirely
  on every future page load, so a single bad network moment logged out a user whose
  cookie was still perfectly valid. Phase 8 already recorded a 41.5 s cold start against
  the 30 s axios timeout — exactly this scenario.

## The fix

Move the API to `api.albumania.net`, a subdomain of the site the SPA already lives on.
`albumania.net` and `api.albumania.net` are the same registrable site, so the cookie is
first-party and `SameSite=Lax` suffices. No third-party-cookie policy applies, in Safari,
Brave, Firefox, or incognito.

Requests remain cross-*origin* (CORS is still required, and already worked) but become
same-*site* — `SameSite` is evaluated per-site, not per-origin.

**Alternative considered:** a Vercel `/api/*` rewrite proxying to Render. It solves the
same problem with no DNS work, but routes every API call through an extra edge hop and
puts avatar uploads under Vercel's proxy body-size limit. Not worth it when the domain
is already owned. No new library was introduced.

## Files touched

| File | Summary |
|---|---|
| `backend/app/routers/auth.py` | `_cookie_opts()`: `SameSite=None` → `Lax` (the API is now same-site), and added `max_age` from `jwt_refresh_ttl_days` so the cookie outlives the browser session |
| `backend/tests/test_auth.py` | Added 3 tests: login sets a `SameSite=lax` + `Max-Age=2592000` + `HttpOnly` cookie; refresh succeeds replaying that cookie; refresh without a cookie 401s |
| `frontend/src/api/client.ts` | `onAuthFailure` now takes `sessionExpired: boolean`, set from `err.response?.status === 401`, so network failures aren't treated as logouts; guarded the response interceptor against an error with no `config` (was a latent `TypeError` masking the real error) |
| `frontend/src/context/AuthContext.tsx` | Session hint is cleared only when `onAuthFailure` reports a genuine 401; the bootstrap `.catch` now only sets logged-out state, so one handler owns the decision |
| `frontend/src/api/client.test.ts` | Split the refresh-failure test into 401 → `onFailure(true)` and network error → `onFailure(false)` |
| `render.yaml` | Rewrote the `COOKIE_SECURE` comment: documents that the service must be reached at `api.albumania.net`, not its `*.onrender.com` URL, and why |

## Infrastructure (not visible in the diff)

1. **Render** → `albumania-api` → Settings → Custom Domains → add `api.albumania.net`;
   add the CNAME it gives you at the DNS host for `albumania.net`. Wait for the domain to
   verify and the certificate to issue, then confirm `https://api.albumania.net/health`.
2. **Render env vars** (dashboard-managed — `render.yaml` is documentation only for this
   service, see [08-deploy.md](08-deploy.md)):
   - `CORS_ORIGINS` = `https://albumania.net,https://www.albumania.net,http://localhost:5173`
   - `API_BASE_URL` = `https://api.albumania.net`
   - `FRONTEND_BASE_URL` = `https://albumania.net` (email links depend on it)
   - Leave `COOKIE_SECURE=true` and `JWT_SECRET` alone — changing the secret logs everyone out.
3. **Vercel** → `VITE_API_BASE_URL` = `https://api.albumania.net` (no trailing slash), then redeploy.

### Deploy order matters

The cookie change and the domain change must land together. Shipping `SameSite=Lax` while
the frontend still points at `onrender.com` would log out **every** user rather than fix
anyone: DNS + custom domain first, then Render env vars, then the code deploy, then flip
`VITE_API_BASE_URL` in Vercel.

**Everyone logged in at cutover gets logged out once** — existing cookies are bound to the
`onrender.com` host and are orphaned by the move. Unavoidable, one-time.

## Verification

- `cd backend && pytest` → 249 passed.
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` → 94 passed, tsc clean, build clean.
- Locally: log in, hard-refresh → still logged in; log out, refresh → still logged out.
  (Local cannot prove the real fix — it was never broken locally.)
- **The real proof, on production, in Safari with default settings:** log in, then
  DevTools → Storage → Cookies → `api.albumania.net` → confirm `refresh_token` shows
  `SameSite=Lax`, `Secure`, and a ~30-day expiry (not "Session"). Refresh → still logged
  in. Quit Safari entirely, reopen → still logged in (that part is the `max_age` fix).
- Repeat in a Chrome incognito window.

## Known gaps, deliberately not addressed

- `ProtectedRoute` uses `<Navigate to="/login" replace />` with no return-URL capture, so
  any logout drops the user's deep link.
- `HTTPBearer()` in `app/core/deps.py` returns 403 rather than 401 when the
  `Authorization` header is missing entirely, and the client interceptor only retries 401.
- Refresh tokens are stateless and unrevocable — a password change does not invalidate
  existing sessions.
