from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album, AlbumTrack
from app.models.friendship import Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.schemas.album import (
    AlbumFriendRating,
    AlbumOut,
    AlbumSearchResult,
    AlbumStats,
    TrackOut,
)
from app.services.avatars import picture_url
from app.services.spotify import SpotifyClient, get_spotify_client
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/albums", tags=["albums"])


@router.get("/search", response_model=list[AlbumSearchResult])
def search_albums(
    _current_user: Annotated[User, Depends(get_current_user)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
    q: Annotated[str, Query(min_length=1)],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[AlbumSearchResult]:
    results = spotify.search_albums(q, limit=limit)
    return [
        AlbumSearchResult(
            spotify_id=r.spotify_id,
            title=r.title,
            artist=r.artist,
            artist_spotify_id=r.artist_spotify_id,
            release_date=r.release_date,
            total_songs=r.total_songs,
            album_art_url=r.album_art_url,
        )
        for r in results
    ]


@router.get("/{spotify_id}/stats", response_model=AlbumStats)
def get_album_stats(
    spotify_id: str,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AlbumStats:
    """Global mean score + rater count over all published ratings for this album."""
    album = db.query(Album).filter(Album.spotify_id == spotify_id).first()
    if album is None:
        # Album not imported yet → no published ratings can exist.
        return AlbumStats(mean_score=None, num_raters=0)

    mean, count = db.execute(
        select(func.avg(Rating.score), func.count(Rating.id)).where(
            Rating.album_id == album.id,
            Rating.status == RatingStatus.published,
            Rating.score.is_not(None),
        )
    ).one()
    return AlbumStats(
        mean_score=round(mean, 2) if mean is not None else None,
        num_raters=count,
    )


@router.get("/{spotify_id}/friend-ratings", response_model=list[AlbumFriendRating])
def get_album_friend_ratings(
    spotify_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> list[AlbumFriendRating]:
    """The current user's accepted friends who have published a rating for this album.

    Powers the album page's "see a friend's ratings" picker — each entry carries
    the friendship id so the frontend can open the pair dashboard directly.
    """
    album = db.query(Album).filter(Album.spotify_id == spotify_id).first()
    if album is None:
        return []  # Album not imported yet → no ratings can exist.

    me = current_user.username
    friendships = db.scalars(
        select(Friendship).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(Friendship.user_a_username == me, Friendship.user_b_username == me),
        )
    ).all()
    # friend username → the friendship id linking us, so the picker can navigate.
    friendship_by_friend = {
        (f.user_b_username if f.user_a_username == me else f.user_a_username): f.id
        for f in friendships
    }
    if not friendship_by_friend:
        return []

    rows = db.execute(
        select(User.username, User.display_name, User.profile_picture_key)
        .join(Rating, Rating.username == User.username)
        .where(
            Rating.album_id == album.id,
            Rating.status == RatingStatus.published,
            User.username.in_(friendship_by_friend.keys()),
        )
        .order_by(User.display_name.asc())
    ).all()

    return [
        AlbumFriendRating(
            username=username,
            display_name=display_name,
            profile_picture_url=picture_url(storage, key),
            friendship_id=friendship_by_friend[username],
        )
        for username, display_name, key in rows
    ]


@router.get("/{spotify_id}", response_model=AlbumOut)
def get_or_import_album(
    spotify_id: str,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
) -> AlbumOut:
    existing = db.query(Album).filter(Album.spotify_id == spotify_id).first()
    if existing:
        changed = False
        # Lazily backfill artist_spotify_id for rows imported before that column
        # existed, so artist links/pages work for the whole catalog over time.
        if existing.artist_spotify_id is None:
            existing.artist_spotify_id = spotify.get_album(spotify_id).artist_spotify_id
            changed = changed or existing.artist_spotify_id is not None
        # Backfill missing tracks for albums imported before we paged past the
        # first 50 (Spotify's album object caps embedded tracks at 50).
        if len(existing.tracks) < existing.total_songs:
            have = {t.index for t in existing.tracks}
            for t in spotify.get_album_tracks(spotify_id):
                if t.index not in have:
                    db.add(
                        AlbumTrack(
                            album_id=existing.id,
                            index=t.index,
                            name=t.name,
                            spotify_url=t.spotify_url,
                            duration_ms=t.duration_ms,
                        )
                    )
                    changed = True
        if changed:
            db.commit()
            db.refresh(existing)
        return _to_album_out(existing)

    album_data = spotify.get_album(spotify_id)
    track_data = spotify.get_album_tracks(spotify_id)

    album = Album(
        spotify_id=album_data.spotify_id,
        title=album_data.title,
        artist=album_data.artist,
        artist_spotify_id=album_data.artist_spotify_id,
        release_date=album_data.release_date,
        total_songs=album_data.total_songs,
        album_art_url=album_data.album_art_url,
    )
    db.add(album)
    db.flush()

    for t in track_data:
        db.add(
            AlbumTrack(
                album_id=album.id,
                index=t.index,
                name=t.name,
                spotify_url=t.spotify_url,
                duration_ms=t.duration_ms,
            )
        )

    db.commit()
    db.refresh(album)
    return _to_album_out(album)


def _to_album_out(album: Album) -> AlbumOut:
    return AlbumOut(
        id=album.id,
        spotify_id=album.spotify_id,
        title=album.title,
        artist=album.artist,
        artist_spotify_id=album.artist_spotify_id,
        release_date=album.release_date,
        total_songs=album.total_songs,
        album_art_url=album.album_art_url,
        tracks=[
            TrackOut(
                index=t.index,
                name=t.name,
                spotify_url=t.spotify_url,
                duration_ms=t.duration_ms,
            )
            for t in album.tracks
        ],
    )
