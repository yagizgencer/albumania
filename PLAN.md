# Albumania — Phased Build Plan

## Context

You and a friend currently have a static demo at https://tugbatumer.github.io/album_ranking (source in [reference/](reference/)) that visualizes how closely two people's album/track rankings agree. Data is hard-coded in [reference/albums.json](reference/albums.json) and [reference/albums/](reference/albums/), with similarity math in [reference/helpers.py](reference/helpers.py) and Spotify enrichment in [reference/create_album_jsons.py](reference/create_album_jsons.py).

We are turning this into a real multi-user web app with:
- **Personal profiles** (public / private / friends-only) where each user logs albums, gives a 0–10 score, picks a top 5, and writes per-song notes. Their dashboard mirrors the demo but defaults to *you vs Spotify popular tracks* as the comparison baseline.
- **Friends**, friend search, and a per-pair **friend dashboard** that auto-populates from the **intersection** of the two friends' published ratings. The "rating date" used in the friend dashboard is the later of the two users' completion dates. (A user's personal dashboard always includes *all* of their own published ratings, regardless of whether the rating originated solo, from a draft, or from an accepted invite — invites only affect Listen Later visibility, not dashboards.)
- **Listen invites**: send a friend an invite for an album; on accept it lands in both users' Listen Later "with friends" tab. Each user's published rating immediately enters their own personal dashboard. Once *both* users have published, the album also lands in the friend dashboard (date = later completion) and the invite is marked complete.
- **Listen Later** with two tabs (solo / with friends). Drafts support drag-and-drop top 5, partial saves, and per-song notes. A draft cannot be *published* until every field is complete; an edit cannot overwrite a published rating with missing fields.
- **Free deployment**: Vercel (frontend) + Render (FastAPI) + Neon (Postgres).

The goal is to **learn FastAPI and React deeply** while doing this — so every phase is small, shippable, unit-tested, and ends with a short notes doc summarizing what was written and where. We optimize for readability and "the simplest thing that works", not framework cleverness.

---

## Stack & Conventions (decided)

- **Backend**: FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, `python-jose` + `passlib[bcrypt]` for JWT auth, `spotipy` for Spotify, `httpx`, `pytest` + `pytest-asyncio` + `httpx.AsyncClient` for tests.
- **DB**: SQLite locally, Postgres (Neon) in production. Same SQLAlchemy models on both; Alembic manages schema.
- **Frontend**: Vite + React 18 + TypeScript, React Router v6, TanStack Query, Chart.js (keeps continuity with the demo), `@dnd-kit` for drag-and-drop, `react-hook-form` + `zod` for forms, plain CSS modules (no Tailwind for now — keep it simple).
- **Spotify**: app-level dev credentials (Client Credentials flow, no per-user Spotify login). Backend exposes `GET /albums/search?q=…` powered by Spotify Search API.
- **Auth**: email + password, JWT access token (short-lived) + refresh token (httpOnly cookie). One library, hand-rolled — that's the learning path.
- **Hosting**: Frontend → Vercel. Backend → Render (free web service). DB → Neon (free Postgres). Secrets via env vars in each platform.
- **Repo layout** (monorepo):
  - `backend/` — FastAPI app, alembic, tests
  - `frontend/` — Vite React app
  - `docs/phases/` — one markdown notes file per completed phase
  - `CLAUDE.md` — agent working guidelines (created in Phase 0)
  - `README.md` — project overview, local-run instructions (created in Phase 0)
- **Phase rule**: each phase ends with (1) feature works end-to-end locally, (2) unit tests pass, (3) `docs/phases/NN-<slug>.md` written summarizing files added/changed.

---

## Files to create up front (Phase 0)

### `CLAUDE.md`
Working guidelines for any Claude session in this repo:
- Project is a learning project — prefer **explicit, readable code** over clever abstractions. No DDD, no service locators, no premature factories.
- One feature at a time. Don't add fields/endpoints for "future use".
- New SQLAlchemy model → Alembic migration in the **same commit**.
- New endpoint → at least one pytest happy-path test + one auth/permission test.
- Every phase ends by writing `docs/phases/NN-<slug>.md` listing files touched and a 1-line summary each. Do not skip this.
- Python: `snake_case`, type hints everywhere, `Annotated[…, Depends(…)]` for DI.
- TS: `camelCase` vars / `PascalCase` components, no `any` unless justified inline.
- Don't introduce a new library without naming the alternative considered and why.
- No background workers, Redis, Celery, websockets, or microservices until a phase truly requires it.

### `README.md`
- Project pitch, screenshot (later), live URLs (later).
- Quickstart: `cd backend && uv sync && alembic upgrade head && uvicorn app.main:app --reload`, `cd frontend && pnpm install && pnpm dev`.
- Env vars table for backend (`DATABASE_URL`, `JWT_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `CORS_ORIGINS`) and frontend (`VITE_API_BASE_URL`).
- Deployment notes per platform.

### `docs/phases/` — created as phases complete, one file each.

---

## Phase Plan

Each phase is sized to be 1–2 sittings. Test count is a floor, not a ceiling.

### Phase 0 — Repo & tooling bootstrap
**Goal**: clean monorepo skeleton, no app logic yet.
- Create `backend/` with `pyproject.toml` (uv-managed), `app/main.py` returning `{"status":"ok"}` at `/health`, `app/core/config.py` (pydantic-settings), `app/db/session.py`, empty `app/models/__init__.py`, empty `app/routers/__init__.py`.
- `backend/alembic.ini` + `alembic/` initialized.
- Create `frontend/` via `pnpm create vite . --template react-ts`. Strip boilerplate. Add `src/api/client.ts` with axios + `VITE_API_BASE_URL`.
- Root: `.gitignore`, `CLAUDE.md`, `README.md`, `docs/phases/.gitkeep`.
- Tests: one pytest hitting `/health`, one Vitest rendering `<App />`.

### Phase 1 — User accounts & JWT auth
**Goal**: register, log in, see "me".
- Backend: `User` model (`id`, `email` unique, `password_hash`, `display_name`, `profile_visibility` enum [`public`, `private`], `created_at`). `public` = visible to anyone; `private` = visible to friends and owner only. Alembic migration. Endpoints: `POST /auth/register`, `POST /auth/login` (returns `{access_token}`), `POST /auth/refresh`, `POST /auth/logout` (clears the refresh token cookie), `GET /users/{id}`. Password hashing via `passlib`. JWT helpers in `app/core/security.py` (signs `sub = str(user.id)`). CORS configured for `VITE_API_BASE_URL`.
- Frontend: `AuthContext` (token in memory, `userId` decoded from JWT `sub` on login/refresh, refresh on 401), `RegisterPage`, `LoginPage`, `ProfilePage` fetching `GET /users/{id}`. Protected route wrapper.
- Tests: register → login → `GET /users/{id}` happy path; wrong password 401; duplicate email 409; `GET /users/{id}` returns 401 without token.

### Phase 2 — Album catalog + Spotify search
**Goal**: search Spotify, persist album + tracks locally on first use.
- Backend: `Album` model (`id`, `spotify_id` unique, `title`, `artist`, `release_date`, `total_songs`, `album_art_url`), `AlbumTrack` model (`album_id`, `index`, `name`, `spotify_url`). `SpotifyClient` wrapper in `app/services/spotify.py` using client-credentials. Endpoints: `GET /albums/search?q=…&limit=10` (proxies Spotify Search), `POST /albums/import` (body `{spotify_id}`, idempotent — returns existing or inserts), `GET /albums/{id}` (with tracks).
- Seed `baseline_loss_stats` from [reference/baseline_loss_stats.json](reference/baseline_loss_stats.json) into a small `BaselineStat` table (`k`, `mean`, `std`). One-off `scripts/seed_baselines.py`.
- Frontend: search bar component, results dropdown, "Import" CTA stub.
- Tests: search returns shaped results (mock Spotify); import is idempotent; baseline seed loads 13+ rows.

### Phase 3 — Personal ratings (draft → publish)
**Goal**: rate an album end-to-end as a solo user.
- Backend: `Rating` model (`id`, `user_id`, `album_id`, `score` nullable float 0–10, `status` enum [`draft`, `published`], `started_at`, `completed_at`, `last_edited_at`, unique on `(user_id, album_id)`). `RatingTopTrack` model (`rating_id`, `position` 1–5, `track_index`) — unique on `(rating_id, position)` and `(rating_id, track_index)`. `SongNote` model (`rating_id`, `track_index`, `note_text`).
- Endpoints: `POST /ratings` (create draft for an album), `GET /ratings/me`, `GET /ratings/me/{album_id}`, `PATCH /ratings/{id}` (partial save — score, top 5 reorder, notes; allowed on drafts and on published only if result still valid), `POST /ratings/{id}/publish` (validates: score present, exactly 5 distinct top tracks, every track has a note). `DELETE /ratings/{id}`.
- Port `compute_ranking_loss` and `compute_similarity_score` from [reference/helpers.py:11](reference/helpers.py#L11) into `app/services/similarity.py` (pure functions, no pandas — just lists). Unit-test them against known examples from [reference/albums.json](reference/albums.json).
- Frontend: `RatingEditorPage` with score input, draggable track list (`@dnd-kit`) splitting into "Top 5" and "Rest" zones, note textarea per track, "Save draft" / "Publish" / "Unpublish" buttons.
- Tests: publish validation (score required, exactly 5 top tracks, all notes present), draft saves partial, edit-after-publish cannot persist invalid state, similarity math matches reference values for one canonical album.

### Phase 4 — Personal profile dashboard (you vs Spotify)
**Goal**: replicate the demo's dashboard for a single user, scoped to **all** of their published ratings (solo or otherwise — invite origin is irrelevant here).
- Backend: `GET /users/{id}/dashboard?compare_to=spotify` returning per-rated-album `{album, score, similarity_user_vs_spotify, completion_date, ...}`. Respects visibility: `public` always visible, `private` requires viewer to be a friend or the owner (Phase 5 wires the friend check fully — for now just owner-can-see).
- Reuse Spotify top-5-popular logic from [reference/create_album_jsons.py](reference/create_album_jsons.py) (cache per album in DB column `spotify_top5_indices`).
- Frontend: `ProfileDashboardPage` — port [reference/index.html](reference/index.html) controls (sort, filter, date-range slider, cumulative toggle, similarity/rating mode), backed by Chart.js. Album list table; clicking a row → album detail.
- `AlbumDetailPage` — port [reference/album.html](reference/album.html), but only the viewing user's column + Spotify column.
- Tests: dashboard endpoint visibility (private blocks others, public allows), correct similarity computation in payload, dashboard route returns only published ratings.

### Phase 5 — Friends
**Goal**: send/accept friend requests, search users, enforce friends-only visibility.
- Backend: `Friendship` model (`id`, `user_a_id`, `user_b_id` with constraint `a < b`, `status` enum [`pending`, `accepted`], `requested_by_id`, `created_at`, `accepted_at`). Endpoints: `POST /friendships` (send), `POST /friendships/{id}/accept`, `POST /friendships/{id}/decline`, `DELETE /friendships/{id}` (unfriend), `GET /friendships/me` (incoming/outgoing/accepted), `GET /users/search?q=…`. Helper `are_friends(a, b)` plug it into the Phase 4 visibility check.
- Frontend: `FriendsPage` (tabs: friends / incoming / outgoing), search modal, friend card linking to profile.
- Tests: cannot friend self, cannot duplicate friendship, accept moves to accepted state, private profiles return 403 to strangers and 200 to friends.

### Phase 6 — Friend dashboards (auto-populated from common ratings)
**Goal**: shared dashboard for any accepted friend pair, populated from the **intersection** of the two users' published ratings (independent of how either user came to rate the album — solo work, draft, or accepted invite all count equally).
- Backend: on friendship accept (and on every new published rating thereafter), recompute the pair's mutual album list — albums both users have published. Store derived rows in `FriendDashboardEntry` (`friendship_id`, `album_id`, `mutual_date` = max of two `completed_at`, `similarity_users`, `mean_score`, `user_a_score`, `user_b_score`). Endpoint `GET /friendships/{id}/dashboard`.
- This is a derived table; rebuild logic in `app/services/friend_dashboard.py` with a single `rebuild_for_pair(friendship_id)` entry point called from rating publish and friendship accept.
- Frontend: `FriendDashboardPage` — full demo-style dashboard with toggle between "similarity" and "ratings" modes; album table; row click opens shared `AlbumDetailPage` showing both users' top 5 + Spotify side-by-side.
- Tests: accepting a friendship with 2 mutually-rated albums seeds 2 entries with correct dates; publishing a third triggers a new entry; unpublishing removes one; unfriending removes all.

### Phase 7 — Listen invites & Listen Later
**Goal**: invite a friend to listen to an album; track shared progress.
- Backend: `ListenInvite` model (`id`, `sender_id`, `receiver_id`, `album_id`, `status` enum [`pending`, `accepted`, `declined`, `completed`], `created_at`, `responded_at`). Endpoints: `POST /invites`, `POST /invites/{id}/accept`, `POST /invites/{id}/decline`, `GET /invites/me` (incoming/outgoing).
- "Listen Later" is a **view**, not a new table: it's the union of (a) the user's own `draft` ratings (solo tab) and (b) accepted `ListenInvite`s for albums the user hasn't yet published (with-friends tab). Backend: `GET /listen-later/solo`, `GET /listen-later/with-friends`.
- When both invitees publish ratings for the invited album, mark invite `completed` and ensure `FriendDashboardEntry` exists (it will via Phase 6 hooks — wire it in here).
- Frontend: `ListenLaterPage` with two tabs; row → rating editor (Phase 3); invite modal on album detail.
- Tests: invite happy path; "with friends" tab hides albums you've already published; completing both ratings flips status and the album appears in friend dashboard.

### Phase 8 — Polish, hardening, deployment
**Goal**: ship it.
- Rate limiting on `/auth/*` (slowapi or hand-rolled), bcrypt cost tuned, refresh token rotation.
- Error boundaries on frontend, toast notifications, empty/loading states audited.
- Production config: `DATABASE_URL` points to Neon, `CORS_ORIGINS` to Vercel domain.
- Render `render.yaml` for the FastAPI service (Python build, `alembic upgrade head` as pre-deploy, `uvicorn` start). Free tier note: cold-start latency on first hit after 15 min idle.
- Vercel deployment of `frontend/`, `VITE_API_BASE_URL` env var, SPA rewrite for React Router.
- Neon project + connection string; verify migrations apply on first deploy.
- GitHub Actions CI: `pytest` on backend, `vitest` + `tsc --noEmit` on frontend, on every PR.
- `docs/phases/08-deploy.md` documents the deploy steps verbatim so we can repeat them.

---

## Reference functions to port (don't re-derive)

| What | Source | Destination |
|---|---|---|
| Top-5 ranking loss | [reference/helpers.py:11](reference/helpers.py#L11) (`compute_ranking_loss_df`) | `backend/app/services/similarity.py` — pure-list version, no pandas |
| Pairwise loss (y vs t / y vs s / t vs s) | [reference/helpers.py:53](reference/helpers.py#L53) (`compute_ranking_losses_extended`) | same file — generic `pair_loss(a, b)` |
| Z-score similarity | [reference/helpers.py:225](reference/helpers.py#L225) (`compute_similarity_score`) | same file |
| Monte-Carlo baseline | [reference/helpers.py:179](reference/helpers.py#L179) (`simulate_ranking_loss`) | `backend/scripts/recompute_baselines.py` (rare) |
| Baseline stats JSON | [reference/baseline_loss_stats.json](reference/baseline_loss_stats.json) | seeded into `BaselineStat` table in Phase 2 |
| Slug normalization | [reference/helpers.py:156](reference/helpers.py#L156) (`make_slug`) | `backend/app/utils/slug.py` (only if we need slugs — defer until profile URLs need them) |

---

## Verification (per phase and overall)

**Per phase**:
1. `cd backend && pytest` — all green.
2. `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green.
3. Manual: open `localhost:5173`, exercise the new feature golden path + one edge case.
4. `docs/phases/NN-<slug>.md` written.

**Overall (after Phase 8)**:
- Two test accounts on prod: register, friend, both rate the same album from search, see it appear in friend dashboard with correct max-date.
- Send invite, accept, both publish, observe invite → `completed` and entry → friend dashboard.
- Toggle a profile to `private`; confirm a non-friend logged-in user gets 403.
- Confirm cold-start on Render works (give it 30s on first hit).

---

## Out of scope (named so we don't drift)

Notifications email/push, mobile app, real-time updates (websockets), comments on ratings, public album browsing for non-friends, social feed, recommendations, multi-language. Each is a possible future phase, but none belongs in v1.
