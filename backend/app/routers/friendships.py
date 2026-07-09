from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification

from app.core.deps import get_current_user, require_verified_email
from app.db.session import get_db
from app.models.album import Album, BaselineStat
from app.models.friendship import FriendDashboardEntry, Friendship, FriendshipStatus
from app.models.invite import ListenInvite
from app.models.rating import Rating, RatingStatus
from app.models.user import ProfileVisibility, User
from app.schemas.dashboard import DashboardAlbum
from app.schemas.friend_dashboard import FriendDashboardEntryOut, FriendDashboardResponse
from app.schemas.friendship import (
    FriendshipCreate,
    FriendshipListResponse,
    FriendshipResponse,
)
from app.models.notification import NotificationType
from app.services.avatars import picture_url_map
from app.services.friend_dashboard import rebuild_for_pair
from app.services.friendship import get_friendship, ordered_pair
from app.services.notifications import create_notification, resolve_notifications
from app.services.similarity import compute_ranking_loss, compute_similarity_score
from app.services.spotify import SpotifyClient, get_spotify_client
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/friendships", tags=["friendships"])


def _hydrate_friendship(
    friendship: Friendship,
    urls: dict[str, str | None],
    visibilities: dict[str, ProfileVisibility] | None = None,
) -> FriendshipResponse:
    vis = visibilities or {}
    return FriendshipResponse(
        id=friendship.id,
        user_a_username=friendship.user_a_username,
        user_b_username=friendship.user_b_username,
        user_a_picture_url=urls.get(friendship.user_a_username),
        user_b_picture_url=urls.get(friendship.user_b_username),
        user_a_visibility=vis.get(friendship.user_a_username),
        user_b_visibility=vis.get(friendship.user_b_username),
        status=friendship.status,
        requested_by=friendship.requested_by,
        requested_by_picture_url=urls.get(friendship.requested_by),
        created_at=friendship.created_at,
        accepted_at=friendship.accepted_at,
    )


@router.post("", response_model=FriendshipResponse, status_code=status.HTTP_201_CREATED)
def create_friendship(
    body: FriendshipCreate,
    current_user: Annotated[User, Depends(require_verified_email("send friend requests"))],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> FriendshipResponse:
    if body.username == current_user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot friend yourself")

    other = db.scalar(select(User).where(User.username == body.username))
    if other is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if get_friendship(db, current_user.username, other.username) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Friendship already exists"
        )

    a, b = ordered_pair(current_user.username, other.username)
    friendship = Friendship(
        user_a_username=a,
        user_b_username=b,
        status=FriendshipStatus.pending,
        requested_by=current_user.username,
    )
    db.add(friendship)
    db.commit()
    db.refresh(friendship)
    # Notify the other side that someone wants to friend them.
    create_notification(
        db,
        recipient_username=other.username,
        type=NotificationType.friend_request,
        actor_username=current_user.username,
        friendship_id=friendship.id,
    )
    db.commit()
    urls = picture_url_map(db, storage, [friendship.user_a_username, friendship.user_b_username, friendship.requested_by])
    return _hydrate_friendship(friendship, urls)


@router.post("/{friendship_id}/accept", response_model=FriendshipResponse)
def accept_friendship(
    friendship_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> FriendshipResponse:
    friendship = _get_for_user(db, friendship_id, current_user.username)
    if friendship.status != FriendshipStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Friendship is not pending"
        )
    if friendship.requested_by == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot accept your own request"
        )

    friendship.status = FriendshipStatus.accepted
    friendship.accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(friendship)
    rebuild_for_pair(db, friendship.id)
    # The accepter's own `friend_request` notification is now stale; flip it
    # to read so it doesn't keep inflating their Friends badge.
    db.execute(
        update(Notification)
        .where(
            Notification.recipient_username == current_user.username,
            Notification.friendship_id == friendship.id,
            Notification.type == NotificationType.friend_request,
        )
        .values(read=True)
    )
    # Notify the original requester that their request was accepted.
    create_notification(
        db,
        recipient_username=friendship.requested_by,
        type=NotificationType.friend_accept,
        actor_username=current_user.username,
        friendship_id=friendship.id,
    )
    db.commit()
    urls = picture_url_map(db, storage, [friendship.user_a_username, friendship.user_b_username, friendship.requested_by])
    return _hydrate_friendship(friendship, urls)


@router.post("/{friendship_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_friendship(
    friendship_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    friendship = _get_for_user(db, friendship_id, current_user.username)
    if friendship.status != FriendshipStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Friendship is not pending"
        )
    if friendship.requested_by == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot decline your own request"
        )
    # Keep the "friend request" notification as read history rather than letting
    # the cascade delete it when we remove the friendship.
    resolve_notifications(db, friendship_id=friendship.id)
    db.delete(friendship)
    db.commit()


@router.delete("/{friendship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_friendship(
    friendship_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    friendship = _get_for_user(db, friendship_id, current_user.username)
    # Tear down any listen invites between the pair (either direction) so a
    # severed friendship doesn't leave stray invites or their notifications
    # behind. Deleting each invite cascades to its notifications.
    a, b = friendship.user_a_username, friendship.user_b_username
    invites = db.scalars(
        select(ListenInvite).where(
            or_(
                (ListenInvite.sender_username == a) & (ListenInvite.receiver_username == b),
                (ListenInvite.sender_username == b) & (ListenInvite.receiver_username == a),
            )
        )
    ).all()
    for invite in invites:
        db.delete(invite)
    db.delete(friendship)
    db.commit()


@router.get("/me", response_model=FriendshipListResponse)
def list_my_friendships(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> FriendshipListResponse:
    me = current_user.username
    rows = db.scalars(
        select(Friendship).where(
            or_(Friendship.user_a_username == me, Friendship.user_b_username == me)
        )
    ).all()

    usernames: set[str] = set()
    for f in rows:
        usernames.update({f.user_a_username, f.user_b_username})
    urls = picture_url_map(db, storage, usernames)
    visibilities: dict[str, ProfileVisibility] = dict(
        db.execute(
            select(User.username, User.profile_visibility).where(
                User.username.in_(usernames)
            )
        ).all()
    ) if usernames else {}

    incoming: list[FriendshipResponse] = []
    outgoing: list[FriendshipResponse] = []
    accepted: list[FriendshipResponse] = []
    for f in rows:
        resp = _hydrate_friendship(f, urls, visibilities)
        if f.status == FriendshipStatus.accepted:
            accepted.append(resp)
        elif f.requested_by == me:
            outgoing.append(resp)
        else:
            incoming.append(resp)
    return FriendshipListResponse(incoming=incoming, outgoing=outgoing, accepted=accepted)


@router.get("/{friendship_id}/dashboard", response_model=FriendDashboardResponse)
def get_friend_dashboard(
    friendship_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> FriendDashboardResponse:
    friendship = _get_for_user(db, friendship_id, current_user.username)
    if friendship.status != FriendshipStatus.accepted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Friendship is not accepted"
        )


    rows = db.execute(
        select(FriendDashboardEntry, Album)
        .join(Album, Album.id == FriendDashboardEntry.album_id)
        .where(FriendDashboardEntry.friendship_id == friendship_id)
        .order_by(FriendDashboardEntry.mutual_date.asc())
    ).all()

    # Preload each user's published top-5s for albums on this dashboard so we can
    # compute similarity-vs-Spotify per user without N round-trips.
    album_ids = [album.id for _, album in rows]
    a_top: dict[int, list[int]] = {}
    b_top: dict[int, list[int]] = {}
    if album_ids:
        for r in db.scalars(
            select(Rating).where(
                Rating.username.in_([friendship.user_a_username, friendship.user_b_username]),
                Rating.album_id.in_(album_ids),
                Rating.status == RatingStatus.published,
            )
        ):
            target = a_top if r.username == friendship.user_a_username else b_top
            target[r.album_id] = r.top_track_indices or []

    entries: list[FriendDashboardEntryOut] = []
    for entry, album in rows:
        if album.spotify_top5_indices is None:
            album.spotify_top5_indices = spotify.get_top5_popular_indices(album.spotify_id)
            db.add(album)
            db.commit()

        sim_a_s = _sim_vs_spotify(db, a_top.get(album.id, []), album.spotify_top5_indices or [], album.total_songs)
        sim_b_s = _sim_vs_spotify(db, b_top.get(album.id, []), album.spotify_top5_indices or [], album.total_songs)

        entries.append(
            FriendDashboardEntryOut(
                album=DashboardAlbum.model_validate(album),
                mutual_date=entry.mutual_date,
                similarity_users=entry.similarity_users,
                similarity_a_vs_spotify=sim_a_s,
                similarity_b_vs_spotify=sim_b_s,
                spotify_top5_indices=album.spotify_top5_indices or [],
                user_a_top_track_indices=a_top.get(album.id, []),
                user_b_top_track_indices=b_top.get(album.id, []),
                mean_score=entry.mean_score,
                user_a_score=entry.user_a_score,
                user_b_score=entry.user_b_score,
            )
        )

    urls = picture_url_map(
        db, storage, [friendship.user_a_username, friendship.user_b_username]
    )
    return FriendDashboardResponse(
        friendship_id=friendship.id,
        user_a_username=friendship.user_a_username,
        user_b_username=friendship.user_b_username,
        user_a_picture_url=urls.get(friendship.user_a_username),
        user_b_picture_url=urls.get(friendship.user_b_username),
        entries=entries,
    )


def _sim_vs_spotify(db: Session, user_top5: list[int], spotify_top5: list[int], k: int) -> float | None:
    if not user_top5 or not spotify_top5:
        return None
    loss = compute_ranking_loss(user_top5, spotify_top5)
    stat = db.scalar(select(BaselineStat).where(BaselineStat.k == k))
    if stat is None:
        return None
    return compute_similarity_score(loss, stat.mean, stat.std)


def _get_for_user(db: Session, friendship_id: int, username: str) -> Friendship:
    friendship = db.get(Friendship, friendship_id)
    if friendship is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found")
    if username not in (friendship.user_a_username, friendship.user_b_username):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your friendship")
    return friendship
