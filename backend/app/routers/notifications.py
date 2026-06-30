from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album, AlbumTrack
from app.models.notification import Notification
from app.models.user import User
from app.schemas.album import AlbumOut, TrackOut
from app.schemas.notification import (
    MarkSeenRequest,
    MarkSeenResponse,
    NotificationItem,
    NotificationSummary,
)
from app.services.avatars import picture_url_map
from app.services.notifications import mark_seen, summary_counts
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/notifications", tags=["notifications"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def _album_out(album: Album) -> AlbumOut:
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


@router.get("/summary", response_model=NotificationSummary)
def get_summary(user: CurrentUser, db: DB) -> NotificationSummary:
    counts = summary_counts(db, user.username)
    return NotificationSummary(**counts)


@router.get("", response_model=list[NotificationItem])
def list_notifications(
    user: CurrentUser,
    db: DB,
    storage: StorageDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[NotificationItem]:
    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.recipient_username == user.username)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    )
    if not rows:
        return []

    actor_urls = picture_url_map(
        db, storage, {n.actor_username for n in rows if n.actor_username}
    )
    album_ids = {n.album_id for n in rows if n.album_id is not None}
    albums: dict[int, Album] = {}
    if album_ids:
        for album in db.scalars(
            select(Album).where(Album.id.in_(album_ids))
        ):
            # touch tracks so _album_out doesn't lazy-load N times
            _ = album.tracks
            albums[album.id] = album

    items: list[NotificationItem] = []
    for n in rows:
        album = albums.get(n.album_id) if n.album_id is not None else None
        items.append(
            NotificationItem(
                id=n.id,
                type=n.type,
                actor_username=n.actor_username,
                actor_picture_url=actor_urls.get(n.actor_username) if n.actor_username else None,
                friendship_id=n.friendship_id,
                invite_id=n.invite_id,
                album=_album_out(album) if album else None,
                read=n.read,
                created_at=n.created_at,
            )
        )
    return items


@router.post("/mark-seen", response_model=MarkSeenResponse)
def post_mark_seen(body: MarkSeenRequest, user: CurrentUser, db: DB) -> MarkSeenResponse:
    updated = mark_seen(db, user.username, body.scope)
    db.commit()
    return MarkSeenResponse(updated=updated)


# Avoid an "unused import" diagnostic — AlbumTrack participates only via the
# `album.tracks` relationship touched above.
_ = AlbumTrack
