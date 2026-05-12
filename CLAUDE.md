# Albumania — Claude working guidelines

This is a **learning project**. The goal is to learn FastAPI and React deeply by building Albumania (see [PLAN.md](PLAN.md)). Optimize for readability and "the simplest thing that works", not framework cleverness.

## Hard rules

- **Explicit, readable code over clever abstractions.** No DDD, no service locators, no premature factories or generic base classes.
- **One feature at a time.** Don't add fields, columns, or endpoints "for future use". If a phase didn't ask for it, don't build it.
- **New SQLAlchemy model → Alembic migration in the *same* commit.** Never let schema drift between code and DB.
- **New endpoint → at least one pytest happy-path test and one auth/permission test.**
- **Every phase ends by writing `docs/phases/NN-<slug>.md`** listing each file touched with a 1-line summary. Do not skip this — it is part of the phase.
- **Don't introduce a new library without naming the alternative considered and why** (in the phase notes or PR description).
- **No background workers, Redis, Celery, websockets, or microservices** until a phase truly requires it. As of [PLAN.md](PLAN.md), none of the planned phases require these.

## Style

- **Python**: `snake_case`, type hints everywhere, `Annotated[T, Depends(...)]` for dependency injection, Pydantic v2 models for request/response schemas, SQLAlchemy 2.x style (`Mapped[...]`, `mapped_column`).
- **TypeScript**: `camelCase` for vars/functions, `PascalCase` for components and types. No `any` unless justified inline with a one-line comment explaining why.
- **Tests**: backend uses pytest + `httpx.AsyncClient`. Frontend uses Vitest + Testing Library. Keep tests close to what a user would do — avoid testing implementation details.

## Repo layout

```
backend/       FastAPI app, Alembic migrations, pytest tests
frontend/      Vite + React + TS app, Vitest tests
docs/phases/   One markdown file per completed phase (NN-<slug>.md)
reference/     Original static demo (album_ranking) — port functions, don't import
PLAN.md        Phased build plan — source of truth for scope
CLAUDE.md      This file
README.md      Project overview, quickstart, env vars, deployment notes
```

## What's already decided (don't re-debate without good reason)

See "Stack & Conventions" in [PLAN.md](PLAN.md). Highlights:

- Backend: FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, `python-jose` + `passlib[bcrypt]`, `spotipy`, `httpx`, pytest.
- Frontend: Vite + React 18 + TS, React Router v6, TanStack Query, Chart.js, `@dnd-kit`, `react-hook-form` + `zod`, plain CSS modules (no Tailwind).
- DB: SQLite locally, Neon Postgres in prod. Same SQLAlchemy models; Alembic manages schema.
- Auth: email + password, short-lived JWT access + refresh token in httpOnly cookie.
- Hosting: Vercel (frontend) + Render (backend) + Neon (Postgres).

## Phase verification checklist

A phase is done when **all four** are true:

1. `cd backend && pytest` — all green.
2. `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green.
3. The new feature's golden path + one edge case work manually in the browser at `localhost:5173`.
4. `docs/phases/NN-<slug>.md` exists and lists every file touched.
