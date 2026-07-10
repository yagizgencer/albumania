# Phase 52 — Artist page polish (margins, Spotify badge, album-card meta chips)

Brings the Artist page (`/artists/:id`) fully in line with the redesigned pages and
enriches its album cards, plus a small backend addition to feed the new duration badge.

## What changed

- **Margins** — `.page` now uses `max-width: min(93vw, 1560px)` + `padding: 0 0.35rem`,
  matching the Album / Friends pages (was the narrower `--page-max`), so the grid uses the
  full width instead of the middle of the screen.
- **Spotify link** — the plain "Open in Spotify ↗" text link is replaced with the shared
  superscript badge (external-link arrow + green Spotify mark) tucked at the top-right of the
  artist name, exactly like the album/rating pages.
- **Album cards** — dropped the artist name (redundant on an artist's own page) and added a
  **disc = release date** chip. `AlbumCard` is only used here, so the change is local. Cards
  are sized to ~5 per row at the page's max width, with a slightly smaller cover (more card
  padding) and bumped title/score type so the rating reads clearly. The date chip is a soft
  borderless pill (muted fill + quiet text) — subtler than a bordered pill — chosen from a
  `design-explorations/album-card-date-badge.html` mockup ("C1").

> Note: an earlier iteration also showed a **hourglass = total duration** chip (backed by a new
> `SpotifyClient.get_album_durations()` batch fetch + a `total_duration_ms` field). That was
> reverted at the user's request — the duration chip and its backend plumbing were removed, so
> the artist endpoint no longer makes the extra Spotify albums call.

## Files touched

(Net changes — the duration chip added mid-phase was reverted, so the backend is unchanged.)

- `frontend/src/pages/ArtistPage.tsx` — full-width margins, Spotify superscript badge, pass
  `releaseDate` (drop `artist`) to `AlbumCard`.
- `frontend/src/pages/ArtistPage.module.css` — page margins, Spotify badge styles, ~5-per-row
  grid.
- `frontend/src/components/AlbumCard.tsx` — remove artist line, add the disc/release-date chip;
  props gain `releaseDate`, drop `artist`.
- `frontend/src/components/AlbumCard.module.css` — meta-chip styles replace `.artist`.
- `frontend/src/components/AlbumCard.test.tsx` / `frontend/src/pages/ArtistPage.test.tsx` —
  updated props and assertions (chip shown, no artist name, Spotify label).

## Verification

- Backend `pytest` — 190 passed.
- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 77 passed (20 files).
- `pnpm build` — clean.

## Notes

- No new libraries. Reuses `DiscIcon`, `formatDate`, the `SpotifyIcon`/`ExternalLinkIcon`
  superscript pattern, and the album page's chip styling.
- The total-duration badge was tried and then removed at the user's request, along with its
  backend fetch — so the artist cards now show only the release-date chip.
