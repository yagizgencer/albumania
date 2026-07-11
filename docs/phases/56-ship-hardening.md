# Phase 56 — Ship-safety hardening + comprehensive tests

Pre-deployment audit pass. The app was feature-complete and well-tested on happy
paths, but had two deploy-config bugs that only surface in production (so tests
never caught them), no resilience to Spotify failures (any bad id / rate-limit /
outage became an opaque 500), and blind spots in the test suite (migrations and
upstream-failure paths were never exercised). This phase closes those gaps.

Scope: backend + light frontend. Rate limiting was **deliberately deferred** (see
"Deferred" below) to keep with the project's minimal-infra philosophy.

## What was already fine (checked, no change)
Comments already cap at 10 000 chars; `RatingPatch` already validates ≤5 distinct
top tracks; R2 misconfig fails lazily (app still boots); the frontend consumers of
the nullable `Rating.top_track_indices` are already guarded (`?? []` /
`idx != null`). No dead code or duplication was found.

## Deploy-config fixes
- **render.yaml** — added `COOKIE_SECURE=true`. Without it `cookie_secure` defaulted
  to `False`, forcing the refresh cookie to `SameSite=Lax`, which the browser won't
  send on the cross-site `POST /auth/refresh` (Vercel → Render) — every user would
  be silently logged out ~15 min after login. This was the top ship-blocker.
- **backend/app/core/config.py** — extracted `INSECURE_JWT_DEFAULT`; added
  `_guard_prod_secrets` (`model_validator`) that refuses to boot when
  `cookie_secure` is true (our prod signal) but `jwt_secret` is still the dev
  default. No-op locally/in tests (both leave `cookie_secure=False`).

## Backend resilience
- **backend/app/core/errors.py** (new) — central handlers translating
  `SpotifyException` (404→404, 429→503, else→502), `requests` `RequestException`
  (→502), and a malformed-payload `KeyError` (→502) into clean JSON, plus a
  catch-all `Exception` handler that logs the traceback and returns a non-leaky 500.
  Chose central handlers over per-router try/except (zero router changes, one place
  to read, logging once) and over a client wrapper (which would still need a handler).
- **backend/app/main.py** — added `logging.basicConfig` and registered the four
  handlers. Verified Starlette still routes `HTTPException`/validation to its
  built-ins, so 404/403/422 behaviour is unchanged (locked in by `test_errors.py`).

## Input-validation caps
- **backend/app/schemas/rating.py** — added `MAX_NOTE_LEN = 2000`; the existing
  validator (renamed `validate_patch`) now rejects over-length song notes.
- **backend/app/routers/ratings.py** — `_require_complete(rating, album)` now also
  rejects top-track indices outside `1..album.total_songs`; `publish`/`republish`
  load the album and pass it. Draft `patch` is intentionally not gated.

## Frontend hardening
- **frontend/src/api/client.ts** — logs a loud console error when a production build
  is missing `VITE_API_BASE_URL` (was silently falling back to localhost).
- **frontend/.env.example** — documents that Vercel must set `VITE_API_BASE_URL`.
- **frontend/src/pages/LoginPage.tsx** — keeps the vague "Invalid login or password"
  only for a real 401; other errors (server down, network) now show the actual
  reason via `getErrorMessage`.

## Tests (backend 197 → 224, frontend 83 → 85)
- **backend/tests/test_spotify_errors.py** (new) — every Spotify failure mode across
  `/albums/{id}`, `/albums/search`, `/artists/{id}`, `/artists/search`,
  `/trending/artists` maps to the right status + message; error bodies leak nothing.
- **backend/tests/test_config.py** (new) — the prod JWT-secret guard and CORS parsing.
- **backend/tests/test_errors.py** (new) — regression: validation still 422,
  `HTTPException` still passes through (catch-all doesn't over-swallow).
- **backend/tests/test_migrations.py** (new) — runs `alembic upgrade head` against a
  throwaway SQLite file and diffs the result against `Base.metadata`
  (`compare_metadata`); asserts no drift. Currently green (no drift).
- **backend/tests/test_ratings.py** — added index-range (out-of-range, zero,
  boundary) and note-length (over-max, at-max) cases, plus 5- and 25-track boundary
  publishes.
- **backend/tests/test_albums.py** — added a backfill-path Spotify-404 → 404 case.
- **frontend/src/pages/LoginPage.test.tsx** (new) — 401 shows the vague message; a
  502 shows the real reason.

## Deferred (noted, not built — per project philosophy)
Rate limiting / brute-force protection on auth, Sentry/APM, secrets manager,
security-headers middleware, DB connection-pool tuning.

## Cannot verify from the repo (confirm in dashboards before launch)
Live Render/Vercel env values (`VITE_API_BASE_URL`, `CORS_ORIGINS`,
`FRONTEND_BASE_URL`, `API_BASE_URL`, R2/Resend secrets) and the Neon backup policy.

## Verification
- `cd backend && uv run pytest` → 224 passed.
- `cd frontend && pnpm test` → 85 passed; `pnpm tsc --noEmit` clean; `pnpm build` ok.
