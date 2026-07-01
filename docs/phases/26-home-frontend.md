# Phase 26 — Home frontend: activity feed + trending

Rebuilds the logged-in home page into a two-column layout consuming the Phase 25
endpoints: a Twitter-style activity timeline on the left and two trending boxes on
the right. Styled with the existing sketch/pastel tokens.

## Frontend

- **`src/api/home.ts`** *(new)* — types (`FeedItem`/`FeedPage`, `TrendingAlbum`,
  `TrendingArtist`, `TrendingPeriod`) + `getFeed(before?, limit?)`,
  `getTrendingAlbums(period)`, `getTrendingArtists(period)`.
- **`src/components/Icons.tsx`** — added `StarIcon` (rating events) and `CommentIcon`
  (comment events); `PeopleIcon` reused for new-friend.
- **`src/components/PeriodToggle.tsx` + `.module.css`** *(new)* — segmented
  Week / Month / Year / All-time control (`.segmented` style).
- **`src/components/ActivityFeed.tsx` + `.module.css`** *(new)* — fetches `getFeed`,
  renders each event (avatar + type badge + a sentence with album/actor links +
  date; `ScoreMeter` for ratings; excerpt for comments). Twitter-style
  scroll-to-past: an `IntersectionObserver` sentinel auto-loads the next `before`
  page, with a "Load older activity" button fallback; loading / empty / error states.
- **`src/components/TrendingBox.tsx` + `.module.css`** *(new)* — generic box
  (title + its own `PeriodToggle`; shows top 5, "Show all N" toggles an internal
  scroll list; loading/empty). Exports `TrendingAlbumRow` (rank · art · title ·
  artist · `ScoreMeter` mean · rating count → album page) and `TrendingArtistRow`
  (rank · `Avatar` photo · name · rating count → artist page).
- **`src/pages/HomePage.tsx` + `HomePage.module.css`** — `LoggedInHome` keeps the
  welcome text + `SketchUnderline` but **drops the avatar**; new two-column grid
  (`.content`): left `ActivityFeed` card, right sticky `.sideCol` with the two
  `TrendingBox`es (albums default fetch = albums, artists = artists). Removed the old
  stats row + "Recently rated" grid (and their `getDashboard`/`listFriendships`/
  `getListenLater` fetches) and their now-dead CSS. `PublicLanding` unchanged.

## Tests

- **`ActivityFeed.test.tsx`** — renders each event type with correct text/links/
  excerpt; the load-older button fetches with the cursor and appends; empty state.
- **`TrendingBox.test.tsx`** — shows 5 then expands to all; re-fetches with the
  selected period.

## Verification

- `cd frontend && pnpm test` → **36 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk warning).
- Backend unchanged (149 passed from Phase 25).
- Manual at `localhost:5173`: home shows welcome (no avatar); left timeline lists
  your + friends' ratings/comments/new-friends newest-first with working links and
  loads older on scroll; right boxes rank albums/artists per their own period toggle,
  albums show mean + cover, artists show photos, rows open album/artist pages.

## Notes

- No new libraries. Reuses `Avatar`, `ScoreMeter`, `formatDate`, `Alert`,
  `LoadingState`, and the `.segmented` / show-more-scroll patterns.
