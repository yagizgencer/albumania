# Phase 21 — Album comments: frontend components + publish flow

Frontend for the Phase 20 comments backend: the API module, reusable comment UI
(composer with an emoji picker, list, item with reactions), and an optional comment
in the rating publish flow. The album-page integration + notification wiring land
in Phase 22.

## New dependency

- **`emoji-picker-react` (4.19.1)** — self-contained emoji picker used by the
  comment composer. Alternative considered: `@emoji-mart/react` + `@emoji-mart/data`
  (two packages + a data blob) — rejected for footprint.

## Files

- **`src/api/comments.ts`** *(new)* — types (`Visibility`, `ReactionValue`,
  `CommentSort`/`SortOrder`, `CommentAuthor`, `Comment`, `CommentReactionResult`)
  and `listComments`, `createComment`, `updateComment`, `deleteComment`,
  `reactToComment`.
- **`src/components/Icons.tsx`** — added `ChevronDownIcon`, `ThumbUpIcon`,
  `ThumbDownIcon`, `UserIcon` (generic silhouette for anonymous authors).
- **`src/components/CommentComposer.tsx` + `.module.css`** *(new)* — textarea +
  emoji-picker popover (click-outside close, inserts at the caret) + visibility
  `<select>` (Public / Friends only / Private). Two modes: **action** (`onSubmit`,
  with a submit/optional-cancel button — used for add + inline edit) and
  **controlled field** (`value`/`onChange`, no buttons — used by the publish flow
  where the page's Publish button submits).
- **`src/components/CommentItem.tsx` + `.module.css`** *(new)* — author block
  (`Avatar` + clickable `/profile/:username` when visible, else `UserIcon` +
  "Anonymous"), text, "(edited)", date; thumbs up/down (toggle, highlight the
  viewer's reaction, net score shown only when ≠ 0 incl. negatives); Edit (inline
  composer) + Remove (inline confirm) for the viewer's own comments.
- **`src/components/CommentsSection.tsx` + `.module.css`** *(new)* — "Comments (N)"
  header, sort controls (Most recent / Most liked × Ascending / Descending), an add
  composer, and the list; keeps local state in sync on react/edit/delete.
- **`src/pages/RatingEditorPage.tsx`** — an optional "Comment (optional)" composer
  (controlled mode) in the publish view; on publish, after `publishRating` it posts
  the comment via `createComment` (decoupled — a comment failure doesn't undo the
  publish).

## Tests

- **`src/components/CommentItem.test.tsx`** — named vs Anonymous author, "(edited)",
  net-score visibility, reaction call + update, own-comment controls.
- **`src/components/CommentsSection.test.tsx`** — lists with count, re-queries on
  sort change, posts + refreshes.
- Both mock `emoji-picker-react` and `../api/comments`.

## Verification

- `cd frontend && pnpm test` → **25 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning; the emoji picker
  adds to bundle size but is lazy in practice via `lazyLoadEmojis`).
- Backend unchanged (still 141 passed from Phase 20).

## Notes

- `CommentsSection` isn't mounted anywhere yet — it's wired into `AlbumInfoPage` in
  Phase 22 along with the notification-bell `comment_liked` entry.
