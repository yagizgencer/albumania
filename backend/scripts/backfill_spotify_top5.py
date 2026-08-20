"""Fill in `albums.spotify_top5_indices` for albums imported before the column
was populated at import time.

Run from backend/:
    uv run python scripts/backfill_spotify_top5.py

Dashboards no longer fetch this on demand — doing so cost one Spotify request per
*track* per album and exhausted the DB connection pool. New albums get it at
import; this catches up the existing catalog.

Slow by design: Spotify's Feb 2026 Development Mode changes removed the batch
"Get Several Tracks" endpoint, so a 12-track album is 13 requests. Safe to
interrupt and re-run — it commits per album and skips albums already filled.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from spotipy.exceptions import SpotifyException
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.album import Album
from app.services.spotify import get_spotify_client

# Be a good citizen: a short pause between albums keeps us clear of 429s, which
# would otherwise get cached into the DB as a degraded (empty) top-5.
PAUSE_SECONDS = 0.2


def main() -> None:
    db = SessionLocal()
    spotify = get_spotify_client()
    try:
        albums = list(
            db.scalars(select(Album).where(Album.spotify_top5_indices.is_(None)))
        )
        if not albums:
            print("Nothing to backfill — every album already has a Spotify top-5.")
            return

        print(f"Backfilling {len(albums)} album(s)...")
        filled = failed = 0
        for i, album in enumerate(albums, start=1):
            try:
                top5 = spotify.get_top5_popular_indices(album.spotify_id)
            except SpotifyException as exc:
                print(f"  [{i}/{len(albums)}] {album.title!r}: SKIPPED ({exc})")
                failed += 1
                continue

            if not top5:
                # Don't persist an empty result — that would look "done" forever
                # and permanently hide the comparison for this album.
                print(f"  [{i}/{len(albums)}] {album.title!r}: SKIPPED (no tracks returned)")
                failed += 1
                continue

            album.spotify_top5_indices = top5
            db.commit()
            filled += 1
            print(f"  [{i}/{len(albums)}] {album.title!r}: {top5}")
            time.sleep(PAUSE_SECONDS)

        print(f"\nDone. {filled} filled, {failed} skipped (re-run to retry those).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
