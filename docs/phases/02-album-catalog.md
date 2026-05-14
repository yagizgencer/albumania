# Phase 2 — Album catalog + Spotify search

## Goal
Search Spotify for albums, persist album + tracks locally on first use, and expose a search UI.

## Design decisions
- **No separate import endpoint.** `GET /albums/{spotify_id}` auto-imports from Spotify on the first call and returns the cached row on subsequent calls. This is simpler and keeps the client API to two endpoints instead of three.
- **`spotipy` for Spotify.** Alternative considered: raw `httpx` calls against the Spotify REST API. `spotipy` was chosen because it handles Client Credentials token refresh automatically and is the decided library in the stack.
- **Monte Carlo simulation instead of seeding from a reference file.** `scripts/seed_baselines.py` runs the simulation directly (1 M trials per k, k ∈ [5, 25]). Alternative: seed from a pre-computed JSON. The simulation approach is authoritative and reproducible.

## Files added / changed

| File | Summary |
|---|---|
| `pyproject.toml` | Added `spotipy>=2.24` dependency |
| `app/models/album.py` | `Album`, `AlbumTrack`, `BaselineStat` SQLAlchemy models |
| `app/models/__init__.py` | Import new models so Alembic picks them up |
| `app/services/__init__.py` | New package |
| `app/services/spotify.py` | `SpotifyClient` wrapper (search, get album, get tracks); `get_spotify_client` dependency factory |
| `app/schemas/album.py` | `AlbumSearchResult`, `AlbumOut`, `TrackOut` Pydantic schemas |
| `app/routers/albums.py` | `GET /albums/search`, `GET /albums/{spotify_id}` |
| `app/main.py` | Register albums router |
| `scripts/seed_baselines.py` | Monte Carlo simulation, seeds `baseline_stats` for k in [5, 25] |
| `alembic/versions/ef275ba19e1c_add_username_to_users.py` | Fixed SQLite incompatibility: added `server_default=""` to the NOT NULL `username` column |
| `alembic/versions/9f640281c8b1_add_albums_tracks_baseline_stats.py` | Migration for the three new tables |
| `tests/test_albums.py` | 6 tests: search shape, search auth, empty query, get/import, idempotency, get auth |
| `frontend/src/api/albums.ts` | `searchAlbums`, `getAlbum` API helpers + TypeScript types |
| `frontend/src/pages/AlbumSearchPage.tsx` | Debounced search input + results dropdown; clicking a result navigates to `/albums/{spotify_id}` |
| `frontend/src/pages/AlbumSearchPage.module.css` | Styles for search page |
| `frontend/src/App.tsx` | Added `/albums/search` protected route |
