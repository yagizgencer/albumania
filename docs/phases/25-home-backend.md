# Phase 25 — Home backend: activity feed + trending

Read-only endpoints powering the new home page: a personalized activity feed and
trending albums/artists. No schema change — pure aggregation over existing tables.

## Backend

- **`app/services/spotify.py`** — new `get_artists(ids) -> {id: image_url}`, batched
  via Spotify's `artists` endpoint (≤50 ids per call) so trending-artist photos cost
  one request. `tests/conftest.py` `_StubSpotifyClient` gains a `get_artists` stub.
- **`app/schemas/home.py`** *(new)* — `FeedActor`, `FeedAlbum`, `FeedItem`
  (`type ∈ you_rated | friend_rated | you_commented | friend_commented | new_friend`),
  `FeedPage {items, next_before}`, `TrendingAlbum`, `TrendingArtist`.
- **`app/routers/home.py`** *(new, registered in `app/main.py`, `tags=["home"]`)*:
  - `GET /home/feed?before=<iso>&limit=20` → merged reverse-chronological timeline of
    the viewer's + accepted friends' final events: published ratings (`completed_at`),
    comments (`created_at`), and accepted friendships (`accepted_at`). Each source is
    queried `< cursor` desc, limited, then merged/sorted/sliced in Python.
    `next_before` = last item's timestamp when the page is full. Friend **private**
    comments are excluded (identity not visible); own + friends'/public are kept.
    Actor display-name + avatar hydrated once via `picture_url`.
  - `GET /trending/albums?period=week|month|year|all` → top-20 albums by unique
    published-rating count in the window (cutoff on `completed_at`), each with its
    **global all-time** mean + rater count (same figure as the album page) and a
    1-based `rank`.
  - `GET /trending/artists?period=…` → top-20 by rating count grouped on
    `Album.artist_spotify_id`, with names + batched Spotify photos + `rank`.
  - Reuses the ordered-pair friends query, the `/albums/{id}/stats` aggregation shape,
    and `picture_url` / `get_spotify_client`.

## Tests — `backend/tests/test_home.py`

Feed merges + orders newest-first; excludes strangers and friends' private comments;
`before`/`next_before` pagination with no page overlap; auth required. Trending album
rank/count/global-mean; period window filtering; artist grouping across an artist's
albums with images from a mocked `get_artists`; auth required.

## Verification

- `cd backend && uv run pytest` → **149 passed**.
- `alembic upgrade head` is a no-op (still `c3e5a7b91d24`) — **no migration**.

## Notes

- No new libraries, no DB migration. The feed cursor is a strict `< before`
  timestamp; per-source `LIMIT = page limit` keeps the merged page gap-free.
