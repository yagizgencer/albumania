# Phase 30 — De-dupe albums on UPC

## Problem

Spotify issues several `spotify_id`s for the *same* real album (regional/label
re-releases). Moodring's "Stargazer" existed under two ids: `6xKM5VYZoDt0H0mPu2Blru`
(label UNFD, available in 0 markets — a dead duplicate) and `1XD2eflndfACkOIf8baanB`
(label Epitaph, 185 markets — the live/canonical edition). Both share one UPC
barcode `196626734433`.

Because `Album.spotify_id` was the only identity, the two editions became two rows.
Ratings scattered: two users had published ratings on the stale row, one user also
had a draft on the canonical row. The artist page (which reads live
`artist_albums`, returning only the canonical id) couldn't find the published
rating attached to the stale id, so it showed "not rated".

## Fix

De-dupe on Spotify's UPC (`external_ids.upc`), which is identical across editions.
UPC is only present on the full `album()` fetch (not search / artist listings), and
the import path already does a full fetch, so this is where we de-dupe.

## Files touched

- `backend/app/models/album.py` — added nullable, indexed `upc` column to `Album`.
- `backend/alembic/versions/d7f2a4c19e35_add_upc_to_albums.py` — migration adding `albums.upc` + index (same commit as the model change).
- `backend/app/services/spotify.py` — added `upc` to `SpotifyAlbumResult` (default `None`); `_album_result_from_item` reads `external_ids.upc` defensively.
- `backend/app/routers/albums.py` — `get_or_import_album`: before creating a new row, reuse any existing row with the same `upc`; lazily backfill `upc` (and `artist_spotify_id`) on already-imported rows.
- `backend/tests/test_albums.py` — `_FAKE_ALBUM` now carries a `upc`; added `test_get_album_dedupes_on_upc` (two spotify_ids, same UPC → one row) and kept the idempotency test green.

## Data migration (Neon prod)

One-off, run in a single transaction:
- Deleted the draft rating (251) on the canonical album + its notes.
- Repointed the two published ratings from the stale album (id 13) to the canonical album (id 73).
- Backfilled `upc` on the canonical row.
- Deleted the stale album's `friend_dashboard_entries`, `album_tracks`, then the album row (id 13).
- Rebuilt the affected friend dashboard (friendship 4) via `rebuild_for_pair` so its Stargazer entry re-derives against the canonical album.

Result: one Stargazer row (id 73), both published ratings on it, artist page and
"my ratings" now agree.

## Library / alternatives

No new library. Alternative de-dupe keys considered: `(title, artist, release_date)`
— rejected as fragile (deluxe/remaster suffixes, punctuation, localized titles).
UPC is Spotify's own stable barcode and matched exactly across the two editions here.

## Verification

- `cd backend && uv run pytest` — 172 passed.
- `cd frontend && pnpm tsc --noEmit` — clean (no frontend changes).
- Neon post-fix query confirms a single Stargazer album, both published ratings
  on it, and friendship 4's dashboard entry pointing at the canonical album.
