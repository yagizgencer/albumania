# Phase 0 — Repo & tooling bootstrap

Clean monorepo skeleton with a passing test on each side. No app logic yet.

## Files created

### Root

- [.gitignore](../../.gitignore) — Python, Node, env, DB, OS/editor ignores.
- [CLAUDE.md](../../CLAUDE.md) — agent working guidelines distilled from [PLAN.md](../../PLAN.md).
- [README.md](../../README.md) — project pitch, quickstart, env-var tables, deployment placeholder.
- [docs/phases/.gitkeep](.gitkeep) — keeps the phases dir tracked.

### Backend (`backend/`)

- [pyproject.toml](../../backend/pyproject.toml) — uv-managed; FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, pydantic-settings; dev group has pytest + httpx.
- [.env.example](../../backend/.env.example) — `DATABASE_URL`, JWT, Spotify, `CORS_ORIGINS`.
- [app/main.py](../../backend/app/main.py) — FastAPI app with CORS middleware and `GET /health` returning `{"status":"ok"}`.
- [app/core/config.py](../../backend/app/core/config.py) — `Settings` via pydantic-settings, cached `get_settings()`.
- [app/db/session.py](../../backend/app/db/session.py) — declarative `Base`, engine, `SessionLocal`, `get_db` FastAPI dependency.
- [app/models/__init__.py](../../backend/app/models/__init__.py) — empty; models added per phase.
- [app/routers/__init__.py](../../backend/app/routers/__init__.py) — empty; routers added per phase.
- [alembic.ini](../../backend/alembic.ini) — script location, blank `sqlalchemy.url` (env supplies it).
- [alembic/env.py](../../backend/alembic/env.py) — reads `DATABASE_URL` from `get_settings()`, imports `app.models`, batch mode on SQLite.
- [alembic/script.py.mako](../../backend/alembic/script.py.mako) — standard Alembic revision template.
- [alembic/README](../../backend/alembic/README) — one-liners for create/upgrade/downgrade.
- [alembic/versions/.gitkeep](../../backend/alembic/versions/.gitkeep) — keeps the versions dir tracked.
- [tests/test_health.py](../../backend/tests/test_health.py) — pytest hitting `/health` via FastAPI `TestClient`.

### Frontend (`frontend/`)

- [package.json](../../frontend/package.json) — pnpm-managed; React 18, Vite 5, TS 5.6, Vitest 2, axios, Testing Library, jsdom.
- [tsconfig.json](../../frontend/tsconfig.json) + [tsconfig.app.json](../../frontend/tsconfig.app.json) + [tsconfig.node.json](../../frontend/tsconfig.node.json) — strict, project-references split.
- [vite.config.ts](../../frontend/vite.config.ts) — React plugin + Vitest config (`jsdom`, globals, setup file).
- [index.html](../../frontend/index.html) — Vite entry HTML.
- [.env.example](../../frontend/.env.example) — `VITE_API_BASE_URL`.
- [src/main.tsx](../../frontend/src/main.tsx) — React 18 root render, strict mode.
- [src/App.tsx](../../frontend/src/App.tsx) — placeholder landing page.
- [src/index.css](../../frontend/src/index.css) — minimal global styles.
- [src/api/client.ts](../../frontend/src/api/client.ts) — axios instance reading `VITE_API_BASE_URL`, `withCredentials: true` for the future refresh-cookie flow.
- [src/vite-env.d.ts](../../frontend/src/vite-env.d.ts) — `ImportMetaEnv` type for `VITE_API_BASE_URL`.
- [src/test-setup.ts](../../frontend/src/test-setup.ts) — wires `@testing-library/jest-dom` matchers into Vitest.
- [src/App.test.tsx](../../frontend/src/App.test.tsx) — renders `<App />` and asserts the heading.

## Verification

1. `cd backend && uv sync && uv run pytest` — 1 test passes.
2. `cd frontend && pnpm install && pnpm test && pnpm typecheck && pnpm build` — 1 test passes, type-check clean, build succeeds.
3. Manual: `uv run uvicorn app.main:app --reload` → `curl localhost:8000/health` returns `{"status":"ok"}`. `pnpm dev` → `localhost:5173` shows the placeholder page.

## Decisions / notes

- **No `app/db/base.py`** — `Base` lives in [app/db/session.py](../../backend/app/db/session.py) alongside the engine. One file until there's a reason to split.
- **Alembic batch mode on SQLite** — enables column drops/alters in local dev; harmless on Postgres.
- **`render_as_batch` is decided per-connection** in `env.py` so it doesn't fire against Neon in prod.
- **`axios.withCredentials = true`** is set now so the Phase 1 refresh-cookie flow doesn't need a follow-up edit.
- **`packageManager` pinned in `package.json`** so `corepack` and CI agree on the pnpm version.
