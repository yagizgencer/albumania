# Phase 22 — Album page rearrange + comments mount + like-notification UI

Rearranges the album page (collapsible tracks merged into the header card, stats
fix), mounts the Phase 21 comments UI, and wires the `comment_liked` notification
into the bell.

## Album page — `src/pages/AlbumInfoPage.tsx` + `.module.css`

- **One card**: the album art/meta grid (`.headerTop`) and the tracks now live in a
  single bordered `.card` instead of two separate boxes.
- **Collapsible tracks**: a full-width "Tracks (N)" toggle button with a
  `ChevronDownIcon` that rotates when open (`.chevronOpen`), **collapsed by
  default** (`tracksOpen` state). The list (with its `max-height`/scroll) renders
  only when expanded.
- **Stats fix**: the "Average" label now renders only when `num_raters > 0`; with no
  ratings the card shows just "No ratings yet" (no dangling label).
- **Comments**: `<CommentsSection spotifyId={album.spotify_id} />` is mounted as a
  new card below the album card.
- CSS: `.header` → `.card` + `.headerTop`; removed the standalone `.tracks` box;
  added `.tracksBlock` / `.tracksToggle` / `.chevron`; retargeted the track-link
  styles from `.tracks a` to `.trackName a`.

## Notification bell — comment_liked

- **`src/api/notifications.ts`** — added `"comment_liked"` to `NotificationType`.
- **`src/components/NotificationBell.tsx`** — `LABELS.comment_liked` → "Someone
  liked your comment" (the existing album meta line names the album); `linkFor` →
  `/albums/:spotifyId`; renders a `ThumbUpIcon` badge instead of an `Avatar`
  (the like is anonymous, no actor).
- **`src/components/NavBar.module.css`** — `.bellLikeIcon` circle for that badge.

## Tests

- **`src/pages/AlbumInfoPage.test.tsx`** — stubs `CommentsSection`; new tests:
  tracks collapsed by default and expand on toggle; top-5 markers after expanding;
  "Average" absent when there are no ratings.
- **`src/components/NotificationBell.test.tsx`** *(new)* — a `comment_liked` item
  renders the anonymous label + album context and links to the album page.

## Verification

- `cd frontend && pnpm test` → **28 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning).
- Backend unchanged (141 passed).
- Manual at `localhost:5173`: album page is one card with collapsible tracks; no
  "Average" label pre-ratings; comments render and post; liking a comment produces
  an anonymous bell notification that opens the album page.

## Notes

- Phase 4 (Settings tabs + Privacy move) is the remaining piece of the approved plan.
