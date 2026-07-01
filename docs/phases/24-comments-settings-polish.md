# Phase 24 — Comments/Settings polish + 3-way profile privacy

Follow-up UX round on the comments feature and Settings, plus a third profile
privacy level.

## New dependency

- **`react-markdown`** — renders comment text as sanitized Markdown (no raw HTML by
  default). Paired with the composer's new Markdown toolbar.

## Backend

- **Separate reaction counts** (`app/schemas/comment.py`, `app/routers/comments.py`):
  `CommentOut`/`CommentReactionOut` now expose `likes` + `dislikes` (non-negative
  counts) instead of a signed `net_score`; "Most liked" sort now orders by `likes`.
- **Comment length**: cap raised 2000 → **10000** (`MAX_COMMENT_LEN`).
- **3-way profile visibility** (`app/models/user.py`): `ProfileVisibility` gains
  `friends`. Dashboard gating in `app/routers/users.py` now means: `public` =
  anyone, `friends` = owner or accepted friends, `private` = owner only (previously
  "private" let friends in — that behavior is now `friends`).
- **Migration** `c3e5a7b91d24` (head): adds the `friends` enum value dialect-aware
  (Postgres `ALTER TYPE`, SQLite no-op).
- **Tests**: reaction test asserts separate `likes`/`dislikes`; friendship tests
  updated — `friends`-only visible to accepted friend, blocks pending; `private`
  blocks even an accepted friend. **142 passed**, migration applies clean.

## Frontend

- **`src/api/comments.ts`** — `likes`/`dislikes` replace `net_score`.
- **`src/api/users.ts`** — `ProfileVisibility` adds `"friends"`.
- **`CommentComposer`** — a Markdown **toolbar** (Bold, Italic, bulleted List, and
  the Emoji picker as one toolbar button); a live **character counter** (`n / 10000`,
  turns red at the cap); the **"Visibility:"** label sits inline to the left of the
  dropdown. Emoji/markdown insert at the caret.
- **`CommentItem`** — renders text as sanitized Markdown; clamps to ~10 lines with a
  **Show more / Show less** toggle (overflow-detected); shows **separate** thumbs-up
  and thumbs-down counts (each hidden when 0; never a negative/net number).
- **`CommentsSection`** — shows the first **10** comments; a **"Show N more
  comments"** button reveals the rest inside an internal scroll area (YouTube-style),
  with "Show fewer" to collapse.
- **`SettingsPage`** — tabs moved to a **left sidebar** (sticky; collapses to a top
  row on narrow screens) with the content in a card; Privacy offers **Public /
  Friends only / Private**.

## Tests

- Frontend suites updated for `likes`/`dislikes`; all green.

## Verification

- `cd backend && uv run pytest` → **142 passed**; `alembic upgrade head` clean.
- `cd frontend && pnpm test` → **31 passed**; `pnpm tsc --noEmit` clean; `pnpm build`
  succeeds (pre-existing >500 kB chunk warning).
- Manual at `localhost:5173`: comment toolbar formats + emoji; counter enforces
  10000; long comments clamp with Show more; >10 comments reveal + scroll; up/down
  show separate counts; Settings tabs on the left; Privacy has three levels and
  friends-only vs private behave distinctly.

## Notes

- Markdown rendering relies on react-markdown's safe defaults (raw HTML disabled);
  links get `target="_blank" rel="noreferrer"`.
