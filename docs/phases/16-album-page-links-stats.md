# Phase 16 — Album page links, stats & top-5 markers

Enhances `AlbumInfoPage`: Spotify deep-links on the title/artist, a "Go to artist
page" button into the Albumania artist page, the global mean rating + rater count,
and (when the viewer has published) our score plus Top-5 markers on the tracklist.

## Frontend

- **`src/api/albums.ts`** — added `AlbumStats` type + `getAlbumStats(spotifyId)`
  (`GET /albums/:spotifyId/stats`, from Phase 13).
- **`src/pages/AlbumInfoPage.tsx`**
  - Title now links to `open.spotify.com/album/:spotifyId`; artist name links to
    `open.spotify.com/artist/:artist_spotify_id` (falls back to plain text if the
    album has no artist id yet). Album art made decorative (`alt=""`) since the
    title link now carries the name.
  - Added a **"Go to artist page"** button → `/artists/:artist_spotify_id`.
  - Fetches album stats and shows **mean score + rater count** (or "No ratings
    yet"); when the viewer's rating is `published`, also shows **"Your score"**.
  - Computes the viewer's top-5 set from `rating.top_track_indices` and renders a
    **"Top 5"** pill next to those tracks (only when published).
- **`src/pages/AlbumInfoPage.module.css`** — added `.headerLink`, `.stats`, and
  `.top5` pill styles.

## Tests

- **`src/pages/AlbumInfoPage.test.tsx`** *(new)* — verifies the title/artist
  Spotify links, the artist-page button, the stats + our-score render, and that
  only the top-5 tracks get the marker.

## Verification

- `cd frontend && pnpm test` → **9 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Backend unchanged this phase (still **123 passed**).
- Manual at `localhost:5173` (owner to confirm): open an album → title/artist open
  Spotify, "Go to artist page" opens the artist page, mean + rater count show, and
  a published rating shows your score with Top-5 markers on the right tracks.

## Notes

- Reused the existing `top_track_indices` from `getMyRatingForAlbum` rather than
  adding a new endpoint — the same data the rating editor already produces.
- No new libraries.
