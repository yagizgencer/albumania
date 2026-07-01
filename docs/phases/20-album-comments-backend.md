# Phase 20 — Album comments: backend

Backend data layer + API for album comments with thumbs up/down, per-comment
identity anonymity, and an anonymous "someone liked your comment" notification.
Frontend UI lands in later phases.

## Models

- **`app/models/comment.py`** *(new)*
  - `CommentVisibility(str, enum)`: `public | friends | private` — controls
    **identity** visibility only (text is always shown).
  - `Comment`: `username` (FK), `album_id` (FK), `text`, `visibility`, `created_at`,
    `edited_at` (nullable → "(edited)"), `reactions` (cascade delete-orphan). No
    unique constraint — multiple comments per user per album are allowed.
  - `CommentReaction`: `comment_id` (FK, cascade), `username` (FK), `value`
    (`+1`/`-1`), unique `(comment_id, username)`. Net score = sum of values.
- **`app/models/notification.py`** — added `NotificationType.comment_liked` and a
  nullable `comment_id` FK (`comments.id`, `ondelete=CASCADE`) so like-notifications
  vanish when the comment is deleted.
- **`app/models/__init__.py`** — registered the new models for metadata/autogen.

## Migration

- **`alembic/versions/b2d4e6f80a13_add_comments.py`** (down_revision
  `a1f3c7d92b04`): creates `comments` + `comment_reactions`, adds
  `notifications.comment_id` (+ index + cascade FK). The new enum value is added
  dialect-aware — Postgres `ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS
  'comment_liked'`; SQLite is a no-op (SQLAlchemy `Enum` creates no CHECK
  constraint by default there). Applied cleanly with `alembic upgrade head`.

## Schemas

- **`app/schemas/comment.py`** *(new)*: `CommentCreate`, `CommentUpdate`,
  `CommentReactionIn` (`value: up|down|none`), `CommentAuthorOut`, `CommentOut`
  (viewer-aware `author: … | None`, `is_mine`, `net_score`, `viewer_reaction`),
  `CommentReactionOut`.

## Router

- **`app/routers/comments.py`** *(new, registered in `app/main.py`)*:
  - `GET /albums/{spotify_id}/comments?sort=recent|score&order=asc|desc` — returns
    `[]` for un-imported albums; sorts in Python.
  - `POST /albums/{spotify_id}/comments` → 201.
  - `PATCH /comments/{id}` — owner-only; sets `edited_at`.
  - `DELETE /comments/{id}` — owner-only.
  - `PUT /comments/{id}/reaction` — upsert/clear reaction; on a transition **to a
    like** (and not a self-like) creates a `comment_liked` notification, deduped to
    one unread per comment.
  - Identity masking `_author_visible`: reveal if viewer is the author, or
    `public`, or (`friends` and `are_friends`). Reuses `are_friends`
    (`app/services/friendship.py`) and `picture_url` (`app/services/avatars.py`).
- **`app/services/notifications.py`** — `create_notification` gained a `comment_id`
  param. `summary_counts`/`mark_seen` unchanged: `comment_liked` counts toward the
  bell automatically. The like notification stores `actor_username=None` (the like
  is anonymous) with `album_id` + `comment_id`.

## Tests

- **`tests/test_comments.py`** *(new, 13 tests)*: CRUD + auth + owner-only;
  anonymity (public shown to strangers, friends masks non-friends, private masks
  everyone but the author); reaction net score incl. negatives + toggle; like
  notifies the author anonymously, no self-notify, repeat likes deduped.

## Verification

- `cd backend && uv run pytest` → **141 passed**.
- `alembic upgrade head` applied cleanly (Postgres dev DB).

## Notes

- No new libraries. Comments are decoupled from ratings (own tables); the publish
  flow will create a comment via this API rather than through the rating endpoints.
