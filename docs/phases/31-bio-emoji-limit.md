# Phase 31 — Profile bio: emoji + rich text + 1000-char limit

## Problem

The profile bio (`User.description`) was a plain `<textarea>` capped at 500
characters, with no live counter and no emoji picker. Album comments, by contrast,
already had a nice composer (bold/italic/list toolbar, emoji picker, live char
counter) and rendered markdown. The bio should get the same treatment, with a
smaller cap of 1000 characters.

## Fix

Reuse the existing `CommentComposer` for the bio instead of building a second
editor. Made two things configurable on the composer so it fits a non-comment
field:

- `maxLength` (defaults to `MAX_COMMENT_LEN`) — the bio passes `MAX_BIO_LEN` (1000).
- `showVisibility` (defaults to `true`) — the bio hides the visibility dropdown,
  which doesn't apply to a profile bio.

The saved bio now renders as markdown on the profile (same `react-markdown` setup
as `CommentItem`), so bold/italic/lists/links work.

Widened the backend column and schema cap from 500 → 1000, with a migration in the
same commit (schema-drift rule).

## Files touched

### Backend
- `backend/app/models/user.py` — `description` column `String(500)` → `String(1000)`.
- `backend/app/schemas/user.py` — `UserUpdate.description` `max_length` 500 → 1000.
- `backend/alembic/versions/00407f70ab0e_widen_user_description_to_1000.py` — new migration widening `users.description` via `batch_alter_table` (up: 500→1000, down: 1000→500). Same commit as the model change.
- `backend/tests/test_users.py` — added `test_patch_me_description_length_limit` (1000 chars accepted → 200; 1001 rejected → 422).

### Frontend
- `frontend/src/components/CommentComposer.tsx` — added `maxLength` and `showVisibility` props; replaced hardcoded `MAX_COMMENT_LEN` in slicing/`maxLength`/counter with the configurable `maxLength`; gated the visibility `<select>` on `showVisibility`.
- `frontend/src/api/users.ts` — exported `MAX_BIO_LEN = 1000` (mirrors the backend cap; backend is the real gate).
- `frontend/src/pages/ProfilePage.tsx` — bio edit field now uses `CommentComposer` (controlled field mode, `showVisibility={false}`, `maxLength={MAX_BIO_LEN}`) instead of a plain textarea; bio display renders through `react-markdown` (links open in a new tab, like comments).
- `frontend/src/pages/ProfilePage.module.css` — `.description` is now a block wrapping markdown paragraphs: dropped `white-space: pre-wrap` (markdown handles paragraphs) and zeroed the first/last child margins so it stays compact in the header.

## Library / alternatives

No new library. Alternative considered: build a dedicated bio editor component.
Rejected — the comment composer already does exactly what's needed (toolbar, emoji
picker, counter) and `react-markdown` is already a dependency, so reusing both is
less code and keeps the two editors visually consistent.

## Verification

- `cd backend && pytest` — 173 passed.
- `alembic upgrade head` — migration applies cleanly (head `00407f70ab0e`).
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — all green (53 tests).
- Manual browser check (golden path: add an emoji + markdown bio, save, see it
  render; edge case: type past 1000 chars and confirm the counter caps) — user to confirm.
