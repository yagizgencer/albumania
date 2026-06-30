# Phase 13 — Artist data layer, album stats & artist endpoint

Adds the data foundation for artist pages (Phases B/C/D/E build on this): a
Spotify artist id on albums, a global album-stats endpoint, and a new artist
endpoint that returns an artist's discography enriched with the viewer's rating
status and global mean scores.

## Backend

- **`app/models/album.py`** — added nullable `artist_spotify_id` column (indexed).
  Nullable so existing rows can backfill lazily; no data migration needed.
- **`alembic/versions/a1f3c7d92b04_add_artist_spotify_id_to_albums.py`** — new
  migration adding the `artist_spotify_id` column + index (ships with the model
  change, same commit).
- **`app/services/spotify.py`**
  - `SpotifyAlbumResult` gained `artist_spotify_id`; added a `_album_result_from_item`
    helper so `search_albums` / `get_album` / `get_artist_albums` build results one way.
  - New `SpotifyArtist` dataclass (`spotify_id`, `name`, `image_url`).
  - New `get_artist(artist_id)`, `get_artist_albums(artist_id)` (studio albums,
    `limit=50`, de-duped by name), and `search_artists(query, limit)` (for Phase B).
- **`app/schemas/album.py`** — `artist_spotify_id` added to `AlbumSearchResult` and
  `AlbumOut`; new `AlbumStats` schema (`mean_score`, `num_raters`).
- **`app/routers/albums.py`**
  - `GET /albums/{spotify_id}/stats` → global mean score + rater count over
    **published** ratings with a non-null score (returns zeros if not imported).
  - `get_or_import_album` now persists `artist_spotify_id` on import and lazily
    backfills it for old rows where it's `None`.
  - Exposes `artist_spotify_id` in search results and `_to_album_out`.
- **`app/schemas/artist.py`** *(new)* — `ArtistOut`, `ArtistAlbumOut` (album summary
  + viewer `status` of `none|draft|published` + `mean_score`/`num_raters`),
  `ArtistDetailOut`.
- **`app/routers/artists.py`** *(new)* — `GET /artists/{artist_id}`: artist header +
  full discography from Spotify; each album enriched with the viewer's status and
  global stats via two grouped queries over the album ids we already have in the DB.
- **`app/main.py`** — registered the artists router.
- **`app/routers/notifications.py`, `app/routers/invites.py`** — their local
  `_album_out` builders now pass `artist_spotify_id` (required by `AlbumOut`).

## Tests

- **`tests/conftest.py`** — `_StubSpotifyClient` gained `get_artist`,
  `get_artist_albums`, `search_artists` stubs.
- **`tests/test_albums.py`** — `_FAKE_ALBUM` carries `artist_spotify_id`; new stats
  tests: published-only mean/count, empty when not imported, auth-required.
- **`tests/test_artists.py`** *(new)* — artist endpoint shape + per-album status
  (`published` / `draft` / `none`) and mean across two raters; auth-required.

## Verification

- `cd backend && uv run pytest` → **121 passed**.
- Migration applied cleanly (`alembic upgrade head`).

## Notes

- No new libraries.
- The three `_album_out` builders (albums/notifications/invites) remain duplicated
  as they were pre-phase — left explicit per CLAUDE.md's "no premature abstraction".
