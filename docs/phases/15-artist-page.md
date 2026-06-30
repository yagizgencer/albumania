# Phase 15 — Artist page + reusable AlbumCard with status badge

Adds the Albumania artist page (`/artists/:artistId`) that search results from
Phase 14 now link to, plus a reusable `AlbumCard` with a status badge.

## Frontend

- **`src/components/Icons.tsx`** — added `CheckIcon` and `PlusIcon` (stroke-style,
  matching the existing inline-SVG icon set) for the card badges.
- **`src/api/artists.ts`** — added `AlbumStatus`, `Artist`, `ArtistAlbum`,
  `ArtistDetail` types and `getArtist(artistId)` (`GET /artists/:artistId`).
- **`src/components/AlbumCard.tsx` + `AlbumCard.module.css`** *(new)* — reusable
  card mirroring HomePage's `.recentCard` look. Props: album summary +
  `meanScore`/`numRaters` + `status`. Renders square art, title, artist, the mean
  as `7.8 (98)` (or `—` when `numRaters === 0`), and a corner badge: grey `+`
  (`none`), yellow headphones (`draft` = Listen Later), green check (`published`).
  The whole card links to `/albums/:spotifyId`.
- **`src/pages/ArtistPage.tsx` + `ArtistPage.module.css`** *(new)* — fetches
  `getArtist`, shows the artist header (image, name, "Open in Spotify" →
  `open.spotify.com/artist/:id`) and a responsive `AlbumCard` grid
  (`repeat(auto-fill, minmax(180px, 1fr))`, like the home grid). Loading / error /
  empty states included.
- **`src/App.tsx`** — registered the protected `/artists/:artistId` route.

## Tests

- **`src/components/AlbumCard.test.tsx`** *(new)* — links to the album page, shows
  `7.8 (98)`, shows `—` with no raters, and renders the correct badge per status.
- **`src/pages/ArtistPage.test.tsx`** *(new)* — renders the artist header, the
  Spotify link, and one card per album with the right badge.

## Verification

- `cd frontend && pnpm test` → **7 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Backend unchanged this phase (still **123 passed** from Phase 14).
- Manual at `localhost:5173` (owner to confirm): search an artist → open the artist
  page → cards show means + correct badges → clicking a card opens the album page.

## Notes

- The optional HomePage "Recently rated" refactor to `AlbumCard` was **skipped**:
  the home cards show *your* score + completion date, whereas `AlbumCard` shows the
  *global* mean + rater count — different semantics, so folding them would change
  the home display. Left as-is per "one feature at a time".
- No new libraries.
