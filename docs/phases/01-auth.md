# Phase 1 — User accounts & JWT auth

## Goal
Register, log in, and see a profile page. End-to-end auth with JWT access token + httpOnly refresh cookie.

## Files touched

### Backend
| File | Summary |
|---|---|
| `pyproject.toml` | Added `python-jose[cryptography]` and `bcrypt>=4.0`; removed `passlib` (incompatible with bcrypt 4+) |
| `app/models/user.py` | `User` model: `id`, `email`, `password_hash`, `display_name`, `profile_visibility` enum, `created_at` |
| `app/models/__init__.py` | Imports `User` so Alembic autogenerate picks it up |
| `alembic/versions/e972c558296c_add_users_table.py` | Migration: creates `users` table with index on `email` |
| `app/core/security.py` | `hash_password`, `verify_password` (bcrypt direct), `create_access_token`, `create_refresh_token`, `decode_token` (python-jose HS256) |
| `app/core/deps.py` | `get_current_user` FastAPI dependency — reads Bearer token, returns `User` or 401 |
| `app/schemas/auth.py` | `LoginRequest`, `TokenResponse` Pydantic models |
| `app/schemas/user.py` | `UserCreate`, `UserResponse` Pydantic models |
| `app/routers/auth.py` | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |
| `app/routers/users.py` | `GET /users/{user_id}` (auth-gated) |
| `app/main.py` | Wired `auth` and `users` routers |
| `tests/conftest.py` | Pytest fixture: in-memory SQLite with `StaticPool`, overrides `get_db` per test |
| `tests/test_auth.py` | Happy path, wrong password 401, duplicate email 409, unauthenticated 401 |

### Frontend
| File | Summary |
|---|---|
| `package.json` | Added `react-router-dom` (v7) |
| `src/api/client.ts` | Module-level token store (`setAccessToken`/`getAccessToken`), request interceptor (Bearer header), response interceptor (silent refresh on 401) |
| `src/context/AuthContext.tsx` | `AuthProvider` with `login`/`logout`, silent refresh on mount via `/auth/refresh` cookie, `useAuth` hook |
| `src/components/ProtectedRoute.tsx` | Redirects to `/login` if `userId` is null after auth loading resolves |
| `src/pages/RegisterPage.tsx` | Register form → calls `POST /auth/register`, stores token, navigates to `/profile/{id}` |
| `src/pages/LoginPage.tsx` | Login form → calls `POST /auth/login`, stores token, navigates to `/profile/{id}` |
| `src/pages/ProfilePage.tsx` | Fetches `GET /users/{userId}`, shows display name / email / visibility / join date, logout button |
| `src/App.tsx` | `BrowserRouter` + `AuthProvider` wrapping routes: `/login`, `/register`, `/profile/:userId`, catch-all → `/login` |
| `src/App.test.tsx` | Updated: mocks `apiClient`, asserts unauthenticated render lands on login page |
| `src/index.css` | Added minimal form / button / error styles |

## Library decisions
- **`passlib` dropped, `bcrypt` used directly** — `passlib 1.7.4` calls `bcrypt.hashpw` with a 214-byte internal test password, which `bcrypt 4+` rejects at the Python level. Using `bcrypt` directly removes the indirection and the incompatibility.
- **`react-router-dom` (v7, not v6 as planned)** — pnpm resolved v7, which is backward-compatible for our usage (BrowserRouter, Routes, Route, Link, Navigate, useParams, useNavigate all unchanged).

## Verification
1. `cd backend && pytest` — 5 passed
2. `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green
3. Manual smoke test (curl): register 201, GET /users/1 200, wrong password 401, no token 401, duplicate email 409, login 200
