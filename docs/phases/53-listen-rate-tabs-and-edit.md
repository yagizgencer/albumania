# Phase 53 — Listen & Rate Active/Completed tabs + editable published ratings

Split the Listen & Rate page into **Active** and **Completed** tabs, and let users
edit + republish a completed rating. Republishing does not re-notify the
together-listened friend and moves the rating to the top of the activity feed
(the old feed entry is replaced, not duplicated). The album page now shows an
**Edit** pencil in place of the star for albums the user has already published.

## Backend

- `backend/app/routers/ratings.py` — added `POST /ratings/{id}/republish` (bumps
  `completed_at` + `last_edited_at`, rebuilds the friend dashboard, and — unlike
  publish — skips `maybe_complete_invites_for_rating`, so no friend notification).
  Extracted the shared score/5-tracks check into `_require_complete`, reused by
  both publish and republish.
- `backend/app/routers/invites.py` — added `GET /listen-later/completed`: all of
  my published ratings (newest-completed first) shaped as `ListenLaterEntry`,
  carrying the same participant chips as the active list (from accepted **or**
  completed invites) so the frontend cards render identically.
- `backend/tests/test_ratings.py` — republish tests: bumps `completed_at`, 422 on
  a draft, 403 for another user's rating.
- `backend/tests/test_invites.py` — completed-view tests (lists published + hidden
  from active; keeps the listened-with chip; requires auth) and a
  republish-does-not-renotify test.

No schema change / no migration — reuses the existing `status`, `completed_at`,
and `last_edited_at` columns.

## Frontend

- `frontend/src/api/ratings.ts` — added `republishRating(ratingId)`.
- `frontend/src/api/invites.ts` — added `getListenLaterCompleted()`.
- `frontend/src/pages/ListenLaterPage.tsx` — Active/Completed `Tabs` driven by a
  `?tab=` URL param (deep-linkable, survives republish redirects); Completed lazily
  fetches published entries and reuses `EntryCard`. `EntryCard` gained a `mode`:
  completed cards show a score chip, an **Edit** (pencil) link into the editor, a
  **Delete rating** action (`deleteRating`), and the listened-with participant
  stack.
- `frontend/src/pages/ListenLaterPage.module.css` — added `.tabsRow`, `.iconEdit`
  (light/dark), and `.scoreChip` (amber, light/dark).
- `frontend/src/pages/RatingEditorPage.tsx` — for a published rating the Publish
  button becomes **Republish** (`handleRepublish` = save then `republishRating`),
  and the Save tooltip reads "Save changes" instead of "Save draft".
- `frontend/src/pages/AlbumInfoPage.tsx` — added an `edit` icon action shown when
  published (replaces the star), opening the same editor via `handleRate`.
- `frontend/src/pages/AlbumInfoPage.module.css` — added `.iconEdit` (light/dark).
- Tests: `ListenLaterPage.test.tsx` (Completed tab Edit link/score/participants +
  delete flow), `AlbumInfoPage.test.tsx` (Edit replaces star, opens editor),
  `RatingEditorPage.test.tsx` (published shows Republish and calls
  `republishRating`).

## UI refinements (follow-up pass)

- `frontend/src/index.css` — hardened the global `[data-tip]` tooltip
  (`font-style: normal; text-decoration: none;`) so link hosts (Edit) and button
  hosts (Remove) render identical chips; fixes the inconsistent hover-text style.
- `frontend/src/pages/ListenLaterPage.tsx` + `.module.css` — replaced the small
  shared `Tabs` with the content column split into two halves (Active | Completed)
  as a subtle **underline** tab bar (`.bigTab`, `flex: 1` each) sitting to the
  right of the invites rail and top-aligned with it; the active half carries a
  quiet teal underline, and each shows an element count in the album-page
  `Tracks (N)` style. The invites rail stays on both tabs. Album + artist names
  are single-line with ellipsis (+ native `title`); the completed score moved out
  of the meta chips into an amber corner **sticker** (`.scoreSticker`, same
  `--data` tag as the album page) tucked into the card's lower-right; the
  release-date and duration chips sit side-by-side under the cover. The Completed
  tab deliberately shows **no** "listening with" participant stack.
- `backend/app/routers/invites.py` — `GET /listen-later/completed` returns empty
  `participants` (the Completed tab doesn't surface who an album was rated with).
- `design-explorations/listen-rate-tabs.html` — interactable artifact used to pick
  the tab treatment (Option A · underline).
- `frontend/src/pages/RatingEditorPage.tsx` + `.module.css` — a published rating
  can't be republished without an actual change (`publishBlocked` uses `isDirty`);
  the button uses `aria-disabled` (not `disabled`) so the explaining tooltip still
  shows on hover; the standalone "Save draft" button is hidden once published.
- `frontend/src/components/DashboardAlbumCell.module.css` — the artist subtitle
  now truncates to one line (it previously truncated the title only). `TrendingBox`,
  `TopSearch`, and `AlbumCard` were already consistent.

## Verification

- `cd backend && pytest` — 197 passed.
- `cd frontend && pnpm test && pnpm tsc --noEmit && pnpm build` — 82 tests pass,
  typecheck + build clean.
