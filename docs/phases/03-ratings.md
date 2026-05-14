# Phase 3 — Personal ratings (draft → publish)

## What was built

Users can now rate an album end-to-end: create a draft, pick a score (0–10), drag-and-drop a top 5, add optional per-track notes, publish when ready, or delete at any time.

## Files touched

### Backend

| File | Summary |
|---|---|
| `app/models/rating.py` | New `Rating` model (username FK, album_id FK, score, top_track_indices JSON, status enum, timestamps) and `SongNote` model (optional per-track notes) |
| `app/models/__init__.py` | Import `Rating` and `SongNote` so Alembic discovers them |
| `alembic/versions/d63cc99c8b3f_add_ratings_song_notes.py` | Migration adding `ratings` and `song_notes` tables |
| `app/schemas/rating.py` | Pydantic v2 schemas: `RatingOut`, `RatingCreate`, `RatingPatch`, `SongNoteOut` |
| `app/services/similarity.py` | Pure-list ports of `compute_ranking_loss` and `compute_similarity_score` from `reference/helpers.py` (no pandas) |
| `app/routers/ratings.py` | All rating endpoints: `POST /ratings`, `GET /ratings/me`, `GET /ratings/me/{album_id}`, `PATCH /ratings/{id}`, `POST /ratings/{id}/publish`, `DELETE /ratings/{id}` |
| `app/main.py` | Register `ratings` router |
| `tests/test_ratings.py` | 21 tests: similarity math, create/patch/publish/delete happy paths, all validation and permission cases |

### Frontend

| File | Summary |
|---|---|
| `src/api/ratings.ts` | API client functions and TypeScript types for all rating endpoints |
| `src/pages/RatingEditorPage.tsx` | Full rating editor: score slider, drag-and-drop Top 5 (`@dnd-kit/sortable`), optional note textarea per track, Save Draft / Publish / Delete buttons |
| `src/pages/RatingEditorPage.module.css` | Styles for the editor page |
| `src/pages/AlbumSearchPage.tsx` | Navigate to `/albums/:spotifyId/rate` on album select |
| `src/App.tsx` | Add protected route `/albums/:spotifyId/rate → RatingEditorPage` |

## Key decisions

- **Top 5 stored as JSON on `Rating`** — avoided a separate `RatingTopTrack` join table; a JSON column on `Rating` is simpler and sufficient since the list is always read/written as a unit.
- **SongNote is optional** — notes exist for user convenience during drafting; they are never required for publishing.
- **No Unpublish** — users can only Delete (draft or published). Simplifies state transitions.
- **Publish validation** — score required + exactly 5 distinct top track indices. Notes not required.
- **@dnd-kit** chosen over `react-beautiful-dnd` (archived, no React 18 support) and `dnd-kit/dnd-kit` manual wiring. `@dnd-kit/sortable` gives sortable lists with minimal boilerplate.

## Verification

- `cd backend && pytest` — 33 passed
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green
- Golden path: search an album → editor opens → set score, pick top 5 by clicking "+ Top 5", drag to reorder, save draft, publish → badge changes to Published
- Edge: try publishing without a score or with fewer than 5 tracks → 422 error shown in UI
