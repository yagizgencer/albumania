# Albumania

Rate albums, compare with friends, find out who actually agrees with you.

Albumania grew out of a [static two-person demo](reference/) into a real multi-user web app: log albums, score 0–10, pick a top 5, write per-song notes, then see how your taste lines up with friends and with Spotify's popular tracks.

See [PLAN.md](PLAN.md) for the full feature scope and phased build plan, and [CLAUDE.md](CLAUDE.md) for working conventions.

## Stack

- **Backend** — FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, JWT auth, Spotify (client-credentials).
- **Frontend** — Vite + React 18 + TypeScript, React Router, TanStack Query, Chart.js, `@dnd-kit`.
- **DB** — SQLite locally, Neon Postgres in production.
- **Hosting** — Vercel (frontend), Render (backend), Neon (Postgres).

## Quickstart

Prerequisites: Python 3.12+, Node 20+, [`uv`](https://docs.astral.sh/uv/), [`pnpm`](https://pnpm.io/).

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

API serves at http://localhost:8000. Health check: `GET /health` → `{"status":"ok"}`.

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

App serves at http://localhost:5173.

### Tests

```bash
cd backend && uv run pytest
cd frontend && pnpm test
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./albumania.db` | Postgres URL in production (Neon). |
| `JWT_SECRET` | *(required in non-dev)* | Used to sign access & refresh tokens. |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Short-lived access token. |
| `JWT_REFRESH_TTL_DAYS` | `30` | Refresh token (httpOnly cookie). |
| `SPOTIFY_CLIENT_ID` | `""` | App-level credentials (no per-user Spotify login). |
| `SPOTIFY_CLIENT_SECRET` | `""` | — |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed origins. |

### Frontend (`frontend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Base URL the SPA hits for API calls. |

## Deployment

Filled in during Phase 8. Short version: push to `main` → Vercel builds the frontend, Render builds the FastAPI service and runs `alembic upgrade head` pre-deploy against Neon.

## Repo layout

```
backend/       FastAPI app, Alembic migrations, pytest tests
frontend/      Vite + React + TS app, Vitest tests
docs/phases/   Notes per completed phase
reference/     Original static demo, kept for porting reference functions
```
