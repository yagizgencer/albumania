from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.schemas.artist import ArtistAlbumOut, ArtistDetailOut, ArtistOut
from app.services.spotify import SpotifyClient, get_spotify_client

router = APIRouter(prefix="/artists", tags=["artists"])


@router.get("/search", response_model=list[ArtistOut])
def search_artists(
    _current_user: Annotated[User, Depends(get_current_user)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[ArtistOut]:
    return [
        ArtistOut(spotify_id=a.spotify_id, name=a.name, image_url=a.image_url)
        for a in spotify.search_artists(q, limit=limit)
    ]


@router.get("/{artist_id}", response_model=ArtistDetailOut)
def get_artist(
    artist_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
) -> ArtistDetailOut:
    """Artist header + full studio discography from Spotify, each album enriched
    with the viewer's rating status and the global mean score / rater count."""
    artist = spotify.get_artist(artist_id)
    spotify_albums = spotify.get_artist_albums(artist_id)

    # Map the Spotify albums to any rows we already have, so we can look up
    # ratings (which key on our integer album id).
    spotify_ids = [a.spotify_id for a in spotify_albums]
    db_albums = (
        db.query(Album).filter(Album.spotify_id.in_(spotify_ids)).all()
        if spotify_ids
        else []
    )
    album_id_by_spotify = {a.spotify_id: a.id for a in db_albums}
    album_ids = list(album_id_by_spotify.values())

    # Global published stats, one grouped query over the matching album ids.
    stats_by_album: dict[int, tuple[float | None, int]] = {}
    if album_ids:
        for album_id, mean, count in db.execute(
            select(Rating.album_id, func.avg(Rating.score), func.count(Rating.id))
            .where(
                Rating.album_id.in_(album_ids),
                Rating.status == RatingStatus.published,
                Rating.score.is_not(None),
            )
            .group_by(Rating.album_id)
        ):
            stats_by_album[album_id] = (mean, count)

    # The viewer's own status per album (draft / published).
    status_by_album: dict[int, RatingStatus] = {}
    if album_ids:
        for album_id, status in db.execute(
            select(Rating.album_id, Rating.status).where(
                Rating.username == current_user.username,
                Rating.album_id.in_(album_ids),
            )
        ):
            status_by_album[album_id] = status

    albums = []
    for a in spotify_albums:
        album_id = album_id_by_spotify.get(a.spotify_id)
        mean, count = stats_by_album.get(album_id, (None, 0))
        status = status_by_album.get(album_id)
        albums.append(
            ArtistAlbumOut(
                spotify_id=a.spotify_id,
                title=a.title,
                artist=a.artist,
                artist_spotify_id=a.artist_spotify_id,
                release_date=a.release_date,
                total_songs=a.total_songs,
                album_art_url=a.album_art_url,
                status=status.value if status is not None else "none",
                mean_score=round(mean, 2) if mean is not None else None,
                num_raters=count,
            )
        )

    return ArtistDetailOut(
        artist=ArtistOut(
            spotify_id=artist.spotify_id,
            name=artist.name,
            image_url=artist.image_url,
        ),
        albums=albums,
    )
