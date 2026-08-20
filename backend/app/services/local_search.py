"""Search our own catalogue, for when Spotify is unavailable.

Spotify throttles shared cloud egress IPs, so a call that works fine from a
laptop can 429 from a hosting provider through no fault of our own usage. That
makes Spotify unsuitable as a hard dependency on a read path.

The shape this pushes the app towards: Spotify is how a *new* album enters the
catalogue, and our own tables serve everything after that. These helpers are the
read side of that — degraded (only what we've imported) but always available.
"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.album import Album
from app.models.artist import Artist
from app.services.spotify import SpotifyAlbumResult, SpotifyArtist


def search_albums(db: Session, query: str, limit: int) -> list[SpotifyAlbumResult]:
    pattern = f"%{query.strip()}%"
    rows = db.scalars(
        select(Album)
        .where(or_(Album.title.ilike(pattern), Album.artist.ilike(pattern)))
        # Exact-ish title matches first, then alphabetical, so "hello" surfaces
        # an album called Hello ahead of one merely by an artist named Hello.
        .order_by(Album.title.ilike(f"{query.strip()}%").desc(), Album.title.asc())
        .limit(limit)
    )
    return [
        SpotifyAlbumResult(
            spotify_id=a.spotify_id,
            title=a.title,
            artist=a.artist,
            artist_spotify_id=a.artist_spotify_id,
            release_date=a.release_date,
            total_songs=a.total_songs,
            album_art_url=a.album_art_url,
            upc=a.upc,
        )
        for a in rows
    ]


def search_artists(db: Session, query: str, limit: int) -> list[SpotifyArtist]:
    """Mirrored artists first, then any artist name we know from albums.

    The `artists` table only holds artists we've had a reason to fetch, so fall
    back to the denormalised name on `albums` to widen the net.
    """
    pattern = f"%{query.strip()}%"
    found: dict[str, SpotifyArtist] = {}

    for a in db.scalars(
        select(Artist).where(Artist.name.ilike(pattern)).order_by(Artist.name.asc()).limit(limit)
    ):
        found[a.spotify_id] = SpotifyArtist(
            spotify_id=a.spotify_id, name=a.name, image_url=a.image_url
        )

    if len(found) < limit:
        rows = db.execute(
            select(Album.artist_spotify_id, Album.artist)
            .where(Album.artist.ilike(pattern), Album.artist_spotify_id.is_not(None))
            .distinct()
            .limit(limit)
        ).all()
        for spotify_id, name in rows:
            if spotify_id not in found and len(found) < limit:
                found[spotify_id] = SpotifyArtist(
                    spotify_id=spotify_id, name=name, image_url=None
                )

    return list(found.values())[:limit]
