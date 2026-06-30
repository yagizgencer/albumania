# Phase 14 — Top bar redesign + global album/artist search

Spotify-style navbar with one always-visible global search that covers both albums
and artists, plus a profile dropdown. Incorporates two feedback changes vs. the
original plan (see notes).

## Backend

- **`app/routers/artists.py`** — new `GET /artists/search?q=&limit=` →
  `list[ArtistOut]`, backed by the `search_artists` service method added in
  Phase 13. Declared **before** `/{artist_id}` so "search" isn't captured as an id.
- **`tests/test_artists.py`** — added artist-search shape + auth tests; the
  Spotify mock now stubs `search_artists`.

## Frontend

- **`src/api/artists.ts`** *(new)* — `ArtistSearchResult` + `searchArtists`.
- **`src/api/albums.ts`** — `artist_spotify_id` added to `AlbumSearchResult` and
  `Album` (backend exposes it as of Phase 13; consumed fully in Phases D/E).
- **`src/components/TopSearch.tsx` + `TopSearch.module.css`** *(new)* — navbar-resident
  debounced search (promotes the old `AlbumSearchBar` pattern). Filter chips
  `All | Albums | Artists`; queries `searchAlbums` and/or `searchArtists` in
  parallel per the active chip. Each result shows a thumbnail + `Album`/`Artist`
  tag; selecting an album → `/albums/:spotifyId`, an artist → `/artists/:artistId`
  (artist route lands in Phase C). Click-outside / Escape closes the dropdown.
- **`src/components/NavBar.tsx` + `NavBar.module.css`** — new layout:
  - **left**: Albumania brand/logo only (→ `/`).
  - **center**: Home icon (→ `/`) · `TopSearch` · Listen Later button (with
    invite badge + `markSeen` wiring).
  - **right**: `NotificationBell` · Friends (badge + `markSeen`) · profile button
    (`Avatar`) opening a dropdown: **Profile** (`/profile/:me`), **Settings**
    (`/settings`), **Log out** (`logout()`). Dropdown is local `useState` + a
    click-outside/Escape handler — no new library.
- **`src/pages/ListenLaterPage.tsx` + `.module.css`** — removed the embedded
  search (`searchSection`); the global navbar search is the only one now.
- **Deleted** `src/components/AlbumSearchBar.tsx` and the orphaned
  `src/pages/AlbumSearchPage.module.css` (nothing referenced them after the move).
- **`src/components/NavBar.test.tsx`** *(new)* — navbar renders the search; the
  profile dropdown opens and shows Profile/Settings/Log out (and Log out calls
  `logout`); the filter chips switch result types. Uses `fireEvent` (no new
  `user-event` dependency).

## Verification

- `cd backend && uv run pytest` → **123 passed**.
- `cd frontend && pnpm test` → **3 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Manual at `localhost:5173` (owner to confirm): search shows album + artist
  results with type tags; chips filter; profile dropdown navigates / logs out;
  Listen Later no longer has its own search bar.

## Notes / feedback applied

- **Single search bar everywhere**: rather than keeping `AlbumSearchBar` on the
  Listen Later page, the search now lives only in the navbar (visible on every
  page). Adding an album to Listen Later still happens on the album page's `+`
  flow — the search bar only ever navigated there.
- **Navbar layout** follows the requested shape: brand on the left; Home icon +
  search + Listen Later in the center; notifications, friends, and profile on the
  right.
- No new libraries.
