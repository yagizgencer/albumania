"""Rules around which albums can be rated / shared.

We only have ranking baselines (see scripts/seed_baselines.py) for album sizes in
[5, 25], so albums outside that range can't be scored, added to Listen Later, or
used in invites.
"""
from fastapi import HTTPException, status

from app.models.album import Album

MIN_ALBUM_SONGS = 5
MAX_ALBUM_SONGS = 25


def is_rateable(album: Album) -> bool:
    return MIN_ALBUM_SONGS <= album.total_songs <= MAX_ALBUM_SONGS


def require_rateable(album: Album) -> None:
    if not is_rateable(album):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Only albums with {MIN_ALBUM_SONGS}–{MAX_ALBUM_SONGS} tracks can be "
                "rated, added to Listen Later, or shared."
            ),
        )
