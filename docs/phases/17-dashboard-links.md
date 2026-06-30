# Phase 17 — Dashboard row links & buttons

Makes the dashboard album cell richer: photo + title link to Spotify, the artist
name links to the Spotify artist, and two small buttons jump to the Albumania
album and artist pages — without disturbing the row's existing click (which still
opens the user/friend album-detail view).

## Backend

- **`app/schemas/dashboard.py`** — added `artist_spotify_id: str | None` to
  `DashboardAlbum`. Both serializers build it with `DashboardAlbum.model_validate(album)`
  and the schema is `from_attributes`, so the field auto-populates from the `Album`
  column added in Phase 13 — no serializer code change. `FriendDashboardEntryOut`
  reuses `DashboardAlbum`, so the friend dashboard gets it for free.

## Frontend

- **`src/api/dashboard.ts`** — added `artist_spotify_id` to the `DashboardAlbum`
  type (also flows into `FriendDashboardEntry`, which reuses it).
- **`src/components/DashboardAlbumCell.tsx` + `.module.css`** *(new)* — one shared
  album cell for both dashboards: art + title → `open.spotify.com/album/:id`,
  artist name → `open.spotify.com/artist/:artist_spotify_id` (plain text when
  absent), and `Album` → `/albums/:id` / `Artist` → `/artists/:artistId` buttons.
  Every inner link calls `stopPropagation` so the row's navigate still fires for
  the rest of the cell.
- **`src/pages/ProfileDashboardPage.tsx`, `FriendDashboardPage.tsx`** — replaced
  the inline album-cell markup with `<DashboardAlbumCell album={e.album} />`.
- **`src/pages/ProfileDashboardPage.module.css`** — removed the now-unused
  `.albumCell/.albumArt/.albumText/.albumTitle/.albumArtist` classes (moved into
  the new component's module; this CSS is shared by both dashboard pages).

## Tests

- **`src/components/DashboardAlbumCell.test.tsx`** *(new)* — verifies the Spotify
  hrefs and internal routes, that clicking a button doesn't bubble to the row, and
  that the artist link/button are omitted when there's no artist id.

## Verification

- `cd backend && uv run pytest` → **123 passed** (additive field).
- `cd frontend && pnpm test` → **12 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Manual at `localhost:5173` (owner to confirm): dashboard rows — photo/title open
  Spotify, artist opens the Spotify artist, the two buttons open the Albumania
  album/artist pages, and clicking elsewhere on the row still opens album-detail.

## Notes

- Extracted a shared `DashboardAlbumCell` rather than duplicating the markup across
  both dashboards — identical content, avoids drift. The row-level navigate (which
  differs: user vs. friendship detail) stays in each page.
- No new libraries.
