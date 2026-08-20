# Phase 57 — Performance, caching, and concurrency hardening

## Why

Two people used the site simultaneously and it fell over: logins returned network
errors, sessions were kicked out, artist pages crawled. Production showed:

```
sqlalchemy.exc.TimeoutError: QueuePool limit of size 5 overflow 10 reached,
connection timed out, timeout 30.00     ...at app/routers/auth.py:82 in login
```

Not a hosting-capacity problem. Three things compounded:

1. `create_engine` was called with **no pool arguments**, so production ran the
   SQLAlchemy defaults — 5 + 10 = **15 connections** — while 54 of 55 sync `def`
   endpoints run in anyio's **40-thread** pool. Threads 16–40 waited 30 s and then
   raised the error above. Login just happened to be a frequent loser.
2. `get_db` holds its connection for the **whole request**, and handlers made
   dozens to hundreds of sequential blocking Spotify calls inside that window.
3. Nothing was cached anywhere, and a new `SpotifyClient` — new `requests.Session`,
   new TLS handshake, disk read of the token cache — was built **per request**.

Worst offenders measured: a cold dashboard fired ~**260** sequential Spotify calls
(`get_top5_popular_indices` is one request *per track*, in a loop over albums, with
`db.commit()` inside the loop); the home page fired **up to 20** (`get_artists`
became one-at-a-time after Spotify removed the batch endpoint in Feb 2026).

## Files touched

### Backend — connection pool and process config

- `app/db/session.py` — pool sized to the threadpool (20 + 20), `pool_timeout=10`
  to fail fast, `pool_pre_ping=True` and `pool_recycle=300` (Neon closes idle
  connections; without pre-ping a dead one gets handed out), plus Postgres
  `connect_timeout`/keepalives so a hung connect can't hold a slot. SQLite path
  unchanged.
- `app/core/config.py` — `db_pool_size`, `db_max_overflow`, `db_pool_timeout`
  settings so prod is tunable without a code change.
- `render.yaml` — `--timeout-keep-alive 65`; `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`;
  comments recording why one worker is deliberate and that `DATABASE_URL` must
  point at Neon's **pooled** (`-pooler`) endpoint.

### Backend — Spotify

- `app/services/cache.py` **(new)** — small in-process TTL cache with per-key
  single-flight, so ten people opening the same artist cost one upstream fetch.
- `app/services/spotify.py` — `get_spotify_client` is now `@lru_cache`d (one
  shared `requests.Session`); `MemoryCacheHandler` instead of the on-disk `.cache`
  that was re-read on every API call; `requests_timeout=5` on both the client and
  the auth manager (the latter defaulted to `None`, i.e. could hang forever);
  retries capped so a 429's `Retry-After` can't sleep a threadpool worker for
  minutes. `search_albums`/`search_artists` (1 h), `get_artist` (24 h) and
  `get_artist_albums` (6 h) are cached; `get_artists` now routes through
  `get_artist` so it benefits too.

### Backend — removing the N+1s

- `app/routers/users.py`, `app/routers/friendships.py` — **deleted the inline
  `get_top5_popular_indices` backfill and its in-loop `db.commit()`** from all three
  dashboards. They are now pure SQL. The `spotify` dependency was dropped entirely
  from both routers. Missing data degrades gracefully (similarity already returns
  `None` for an empty top-5).
- `app/routers/albums.py` — album import fetches the top-5 once, where Spotify
  latency is already expected; failure is non-fatal.
- `scripts/backfill_spotify_top5.py` **(new)** — one-off catch-up for the existing
  catalog. Idempotent, commits per album, never persists an empty result.
- `app/services/similarity.py` — `get_baseline`/`reset_baseline_cache`:
  `baseline_stats` is static seed data but was re-queried per album (3× per album
  on the comparison page, ~90 queries). Loaded once per process now.
- `app/services/friendship.py` — `accepted_friend_usernames`: one query for a
  user's friend set.
- `app/routers/comments.py` — `_author_visible` takes that set instead of calling
  `are_friends` once per comment. Create/update pass an empty set, since they only
  ever render the viewer's own comment.
- `app/services/friend_dashboard.py` — uses the cached baseline lookup.
- `app/services/notifications.py` — `summary_counts` aggregates with
  `GROUP BY`/`COUNT` instead of fetching every unread row and counting in Python.
  This is the most-called query in the app.

### Backend — artists mirror and indexes

- `app/models/artist.py` **(new)** — `Artist` table so trending photos come from
  our DB, not from up to 20 sequential Spotify calls per home-page load.
- `app/models/__init__.py` — registers it.
- `app/routers/home.py` — trending artists reads the mirror and only asks Spotify
  for ids never seen. Removed the stale `# single batched Spotify call` comment.
- `app/routers/artists.py` — upserts the artist header into the mirror.
- `app/models/notification.py`, `rating.py`, `friendship.py`, `comment.py` —
  composite indexes declared via `__table_args__`, plus `index=True` on the two
  notification FKs that lacked it. (Every other FK was already indexed.)
- `alembic/versions/c3f9a17b4e82_artists_table_and_perf_indexes.py` **(new)** —
  creates the table and all nine indexes. Verified up *and* down on a scratch DB.

### Backend — blocking I/O off the request path

- `app/routers/auth.py` — the five email sends moved to FastAPI `BackgroundTasks`,
  so a slow Resend call (10 s timeout) no longer keeps a request and its pooled
  connection alive.
- `app/routers/users.py` — `upload_avatar` changed from `async def` to `def`. It was
  the only `async def` endpoint and it ran blocking boto3 + psycopg2 **directly on
  the event loop**, freezing every other request for the duration of an upload.
- `app/routers/media.py` — `Cache-Control: immutable, max-age=31536000` (avatar keys
  embed a uuid4, so a key's bytes never change) plus an `ETag` with 304 handling.
  Every avatar in the UI is a request here, each a boto3 round-trip holding a
  threadpool slot; at `max-age=3600` browsers re-fetched unchanged images hourly.

### Frontend

- `src/api/client.ts` — module-level single-flight guard on `/auth/refresh`
  (`refreshAccessToken`), and `setOnAuthFailure` so a failed refresh actually
  clears the session. Previously N parallel 401s produced N parallel refreshes,
  and a failed refresh left the app rendering as logged-in while the poller
  retried forever.
- `src/context/AuthContext.tsx` — registers the failure handler; skips the boot
  `/auth/refresh` for browsers that have never logged in (a `localStorage` hint),
  so anonymous landing-page visitors no longer block the SPA on a guaranteed 401.
- `src/context/NotificationsContext.tsx` — poll 30 s → 60 s, skipped while the tab
  is hidden, with an immediate catch-up on `visibilitychange`.
- `src/pages/AlbumInfoPage.tsx` — the 6-request **sequential waterfall** collapsed
  to 1-then-5 via `Promise.allSettled`. `loadInviteState` split into a fetch and a
  pure `applyInviteState` so both paths share one code path.
- `src/api/cache.ts` **(new)** — tiny TTL cache with in-flight dedup.
- `src/api/artists.ts`, `src/api/albums.ts` — `getArtist`/`getAlbum` go through it,
  so back-navigation is instant instead of re-fetching with a spinner.
- `frontend/vercel.json` — `immutable` cache headers for Vite's content-hashed
  `/assets`.
- `frontend/package.json` — moved `vercel` from `dependencies` to `devDependencies`
  (a large CLI was being pulled into every production install).

### Tests

- `tests/test_cache.py` **(new)** — hit, expiry, eviction, and the single-flight
  guarantee under 8 concurrent threads.
- `tests/test_dashboard.py` — `test_dashboard_caches_spotify_top5` replaced by
  `test_dashboard_never_calls_spotify`, asserting a dashboard makes **zero**
  Spotify calls even when top-5 data is missing. This is the regression that took
  the site down. Seed helper takes `spotify_top5`.
- `tests/test_home.py` — `test_trending_artists_reuses_stored_images`: a second
  trending load makes no further Spotify calls.
- `tests/conftest.py` — autouse fixture resetting the process-wide baseline and
  Spotify caches between tests (they intentionally outlive a request in prod, but
  each test builds a fresh DB).
- `tests/test_albums.py`, `tests/test_friend_dashboard.py` — seed the top-5 the way
  the import path now does.
- `src/api/client.test.ts` **(new)** — a burst of parallel refreshes produces
  exactly one request; the guard clears afterwards; failure notifies the handler.
- `src/App.test.tsx` — mock updated for the new client exports.

## Alternatives considered

- **Redis / Upstash for caching.** Rejected: production runs exactly one uvicorn
  process, so a process-local dict is already coherent and Postgres holds the
  durable copy. Redis would add a service, a dependency and a network hop per
  lookup, and CLAUDE.md's "no Redis until a phase requires it" still holds. Revisit
  if a second instance is ever added — the in-process cache stops being coherent
  at that point, which is also why `render.yaml` documents the single worker.
- **TanStack Query.** PLAN.md specified it but it was never actually installed;
  the frontend is raw axios with zero caching. Adopting it would subsume the
  hand-rolled cache and the dedup, but it is a refactor across ~15 fetch effects
  and belongs in its own phase.
- **More Render workers.** Rejected: 0.5 CPU, and the workload is I/O-bound. A
  second process doubles memory and adds context-switching without throughput.
- **Precomputing top-5 only via script.** Rejected in favour of filling it at
  import *and* shipping the script, so the catalog converges without a manual step
  being mandatory.

## Verification

- `cd backend && pytest` — **233 passed**.
- `cd frontend && pnpm test` — **88 passed**; `pnpm tsc --noEmit` and `pnpm build`
  clean.
- Migration applied and rolled back cleanly against a scratch SQLite DB;
  `test_migrations_match_models` confirms no model/migration drift.

### Still to do by hand

1. Point `DATABASE_URL` at Neon's **pooled** endpoint in the Render dashboard (it
   is `sync: false`, so it is not in version control). The local `.env` uses the
   direct endpoint.
2. Run `uv run python scripts/backfill_spotify_top5.py` once after deploy.
3. Load check against the real goal:
   `hey -n 400 -c 20 -H "Authorization: Bearer $TOKEN" https://<api>/home/trending/artists`
   — expect zero `QueuePool` errors and p95 well under 1 s.
