# Phase 27 — Home, dashboard & album-page polish

A batch of UX refinements: the home trending sidebar now stays pinned and fits the
viewport, the activity feed can be filtered by category, read notifications are
capped so the table can't grow unbounded, dashboard table headers align with their
values, and the album-page Track List reads as clearly expandable.

## Frontend

- **`src/pages/HomePage.module.css`** — `.content` sidebar widened `340px → 380px`
  (tightening the feed). `.sideCol` gets `max-height: calc(100vh - 2rem)` and
  `.sideCol > * { flex: 1 1 0; min-height: 0 }` so its two boxes split the viewport
  height (Twitter-style pinned rail). The `860px` single-column branch reverts both
  (static, `flex: none`) so mobile keeps the compact per-box scroll.
- **`src/components/TrendingBox.tsx`** — new `fill?: boolean` prop applying a
  `.fill` class to the root `.section`.
- **`src/components/TrendingBox.module.css`** — `.title` bumped `1.05rem → 1.2rem`,
  weight `700`. New `.fill` variant makes the box a flex column with `min-height: 0`
  and its `.list` `flex: 1; max-height: none` so the list scrolls internally instead
  of overflowing the rail.
- **`src/pages/HomePage.tsx`** — passes `fill` to both `<TrendingBox>`es.
- **`src/api/home.ts`** — new `FeedCategory` (`"ratings" | "comments" | "friends"`);
  `getFeed(before?, limit?, types?)` sends repeated `types` params only when a
  strict subset is active.
- **`src/api/client.ts`** — `paramsSerializer: { indexes: null }` so array params
  serialize as `types=a&types=b` (what FastAPI's `list[...]` expects).
- **`src/components/ActivityFeed.tsx`** — category filter: `selected` Set (all on by
  default) driving a row of toggle chips; toggling refetches with the active
  categories; deselecting all shows a "pick a type" prompt. Rendering split into a
  `FeedBody` helper so chips always show above the feed. Infinite-scroll logic
  unchanged.
- **`src/components/ActivityFeed.module.css`** — `.filter` / `.chip` / `.chipOn`
  pill styles.
- **`src/pages/ProfileDashboardPage.module.css`** (shared by the friend dashboard) —
  header side padding `0.9rem → 0.6rem` to match the cells, so each label sits
  directly above its column's values; refreshed the stale `.numCell` / `.th` comments.
- **`src/pages/AlbumInfoPage.tsx`** — Track List chevron wrapped in a `.chevronChip`
  span.
- **`src/pages/AlbumInfoPage.module.css`** — `.tracksToggle` restyled into a bordered,
  rounded header bar with a hover state; new `.chevronChip` pastel pill housing the
  rotating chevron.

## Backend

- **`app/routers/home.py`** — `get_feed` gains a `types: list[Literal[...]] | None`
  query param; each of the three candidate source loops (ratings / comments /
  friends) is guarded by a small `wants(category)` helper. Omitting `types` returns
  every category (backward compatible).
- **`app/services/notifications.py`** — new `prune_read_notifications(db, username,
  keep=10)` deletes a user's oldest read rows beyond the newest `keep`; unread rows
  are never touched. Called at the end of `mark_seen` (read transition point).
  `READ_RETENTION = 10` constant. No schema change / no migration.

## Tests

- **`backend/tests/test_home.py`** — `test_feed_filters_by_type`: single category,
  union of two, and no-filter-returns-all.
- **`backend/tests/test_notifications.py`** — `test_prune_keeps_last_ten_read_and_all_unread`
  (direct service call, idempotent) and `test_mark_seen_prunes_old_read` (end-to-end
  via the bell).
- **`frontend/src/components/ActivityFeed.test.tsx`** — updated load-older assertion
  for the 3-arg `getFeed`; added chip-narrows-refetch and deselect-all-prompt tests.

## Verification

- `cd backend && pytest` → **152 passed**.
- `cd frontend && pnpm test` → **38 passed**; `pnpm tsc --noEmit` clean; `pnpm build`
  succeeds (pre-existing >500 kB chunk warning). Note: `pnpm install` was run to sync
  `react-markdown` / `emoji-picker-react`, which were declared but missing from
  `node_modules`.
- Manual at `localhost:5173`: trending boxes stay pinned and scroll internally as the
  window shrinks; feed chips narrow the timeline; dashboard labels sit over their
  values; the Track List bar reads as clickable and expands/collapses; opening the
  bell caps read notifications at 10 while unread persist.

## Follow-up fixes

- **`src/index.css`** — new `--nav-height: 80px` token (the sticky nav's height) so
  sticky panels can offset below it.
- **`src/pages/HomePage.module.css`** — the earlier `max-height` sidebar collapsed
  (`flex: 1 1 0` needs a *definite* height): switched `.sideCol` to
  `height: calc(100vh - var(--nav-height) - 1.5rem)` and `top: calc(var(--nav-height)
  + 0.75rem)` so it sits below the nav and the two boxes split it. Mobile resets to
  `height: auto`.
- **`src/components/ActivityFeed.tsx` + `.module.css`** — redesigned the category
  filter into a clearer, more standard control: a "Show" label plus outlined/filled
  toggle chips, each with its category icon (`StarIcon` / `CommentIcon` / `PeopleIcon`,
  matching the feed badges), a divider, and more breathing room.
- **Font consistency** — normalized display-font (Patrick Hand) section headings that
  were faux-bolded / uppercased (which read "too professional" against the cozy
  sketch style) to the natural sentence-case weight used by the rest of the site:
  `TrendingBox.module.css` `.title` (dropped `font-weight: 700`),
  `ProfilePage.module.css` `.sectionTitle` and `RatingEditorPage.module.css`
  `.columnHeading` (dropped uppercase + `font-weight: 600`). Small Nunito micro-labels
  (`.tag`, `.badge`, `.statLabel`, table sort headers) were intentionally left as-is.

## Remove a rating from the album page

- **`src/pages/AlbumInfoPage.tsx`** — when the viewer has a *published* rating, the
  actions row now shows a "Remove rating" button beside the "Rated" indicator.
  Clicking it swaps in the same inline "Remove this rating?" confirm used by the
  rating editor (Yes, remove / Cancel). Confirming calls the existing
  `deleteRating(id)`, resets local state to unrated, refreshes album stats (the
  average no longer includes the removed score), and shows a "Your rating was
  removed." message.
- **`src/pages/AlbumInfoPage.module.css`** — `.btnRemove` / `.btnRemoveConfirm` /
  `.btnCancel` / `.confirm` / `.confirmText`, mirroring the rating editor's styles.
- **`src/pages/AlbumInfoPage.test.tsx`** — confirm-then-delete happy path, cancel
  (no delete), and that the control is hidden for an unrated album. Added
  `vi.clearAllMocks()` to `beforeEach` so call history doesn't leak between tests.
- Backend unchanged: `DELETE /ratings/{id}` (owner-only, deletes invites + rebuilds
  the friend dashboard for published ratings) and `deleteRating()` already existed
  and are covered by `test_ratings.py` (`test_delete_published_rating`,
  `test_delete_other_users_rating_returns_403`).

## Notes

- No new libraries (table alignment fixed with CSS per the project's no-new-lib rule;
  TanStack Table was considered and rejected). Reuses the segmented-control visual
  language, `mark_seen`/`summary_counts` seam, and the existing IntersectionObserver
  infinite scroll.
- Behavior worth flagging: opening the bell already marks *all* unread as read, so
  after opening, the panel retains only the 10 newest — the intended consequence of
  "keep last 10 read."
