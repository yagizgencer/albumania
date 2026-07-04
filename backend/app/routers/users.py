import uuid
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album, BaselineStat
from app.models.rating import Rating, RatingStatus
from app.models.user import ProfileVisibility, User
from app.schemas.dashboard import DashboardAlbum, DashboardEntry, DashboardResponse
from app.schemas.friend_dashboard import FriendDashboardEntryOut, FriendDashboardResponse
from app.schemas.friendship import UserSearchResult
from app.schemas.user import UserResponse, UserUpdate
from app.services.avatars import picture_url
from app.services.friendship import are_friends
from app.services.similarity import compute_ranking_loss, compute_similarity_score
from app.services.spotify import SpotifyClient, get_spotify_client
from app.services.storage import Storage, get_storage

router = APIRouter(prefix="/users", tags=["users"])

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
_EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _user_response(user: User, storage: Storage) -> UserResponse:
    return UserResponse(
        username=user.username,
        email=user.email,
        email_verified=user.email_verified,
        display_name=user.display_name,
        description=user.description,
        profile_visibility=user.profile_visibility,
        profile_picture_url=picture_url(storage, user.profile_picture_key),
        created_at=user.created_at,
    )


@router.get("/search", response_model=list[UserSearchResult])
def search_users(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
    q: Annotated[str, Query(min_length=1, max_length=50)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> list[UserSearchResult]:
    pattern = f"%{q}%"
    rows = db.scalars(
        select(User)
        .where(
            User.username != current_user.username,
            (User.username.ilike(pattern)) | (User.display_name.ilike(pattern)),
        )
        .order_by(User.username.asc())
        .limit(limit)
    ).all()
    return [
        UserSearchResult(
            username=u.username,
            display_name=u.display_name,
            profile_picture_url=picture_url(storage, u.profile_picture_key),
            profile_visibility=u.profile_visibility,
        )
        for u in rows
    ]


@router.patch("/me", response_model=UserResponse)
def update_me(
    body: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> UserResponse:
    user = db.scalar(select(User).where(User.username == current_user.username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    data = body.model_dump(exclude_unset=True)
    if "display_name" in data:
        user.display_name = data["display_name"]
    if "description" in data:
        user.description = data["description"]
    if "profile_visibility" in data:
        user.profile_visibility = data["profile_visibility"]
    db.commit()
    db.refresh(user)
    return _user_response(user, storage)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
    file: Annotated[UploadFile, File(...)],
) -> UserResponse:
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, or WebP images are allowed",
        )

    max_bytes = get_settings().avatar_max_bytes
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image too large (max {max_bytes // (1024 * 1024)} MB)",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file"
        )

    ext = _EXT_BY_TYPE[file.content_type]
    new_key = f"avatars/{current_user.username}-{uuid.uuid4().hex[:8]}.{ext}"
    storage.save(new_key, data, file.content_type)

    user = db.scalar(select(User).where(User.username == current_user.username))
    if user is None:
        # Shouldn't happen — get_current_user resolved them from the DB.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_key = user.profile_picture_key
    user.profile_picture_key = new_key
    db.commit()
    db.refresh(user)

    if old_key and old_key != new_key:
        storage.delete(old_key)

    return _user_response(user, storage)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> Response:
    user = db.scalar(select(User).where(User.username == current_user.username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_key = user.profile_picture_key
    user.profile_picture_key = None
    db.commit()
    if old_key:
        storage.delete(old_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{username}", response_model=UserResponse)
def get_user(
    username: str,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[Storage, Depends(get_storage)],
) -> UserResponse:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _user_response(user, storage)


def require_can_view_profile(db: Session, *, viewer: User, target: User) -> None:
    """Raise 403 if `viewer` may not see `target`'s ratings/dashboard. The owner
    always may; a public profile is visible to everyone; a friends-only profile
    only to accepted friends; a private profile to no one else. Shared by the solo
    dashboard and the pair-comparison endpoint so the rules (and messages) match."""
    if viewer.username == target.username:
        return
    vis = target.profile_visibility
    if vis == ProfileVisibility.private:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Profile is private"
        )
    if vis == ProfileVisibility.friends and not are_friends(
        db, viewer.username, target.username
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Profile is visible to friends only"
        )


@router.get("/{username}/dashboard", response_model=DashboardResponse)
def get_user_dashboard(
    username: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
    compare_to: Annotated[Literal["spotify"], Query()] = "spotify",
) -> DashboardResponse:
    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    require_can_view_profile(db, viewer=current_user, target=user)

    rows = db.execute(
        select(Rating, Album)
        .join(Album, Album.id == Rating.album_id)
        .where(Rating.username == user.username, Rating.status == RatingStatus.published)
        .order_by(Rating.completed_at.asc())
    ).all()

    entries: list[DashboardEntry] = []
    for rating, album in rows:
        if album.spotify_top5_indices is None:
            album.spotify_top5_indices = spotify.get_top5_popular_indices(album.spotify_id)
            db.add(album)
            db.commit()

        similarity = _similarity_against_spotify(
            user_top5=rating.top_track_indices or [],
            spotify_top5=album.spotify_top5_indices or [],
            k=album.total_songs,
            db=db,
        )

        entries.append(
            DashboardEntry(
                album=DashboardAlbum.model_validate(album),
                score=rating.score,
                top_track_indices=rating.top_track_indices or [],
                spotify_top5_indices=album.spotify_top5_indices or [],
                similarity_user_vs_spotify=similarity,
                completed_at=rating.completed_at,
            )
        )

    return DashboardResponse(username=user.username, entries=entries)


def _similarity_against_spotify(
    user_top5: list[int], spotify_top5: list[int], k: int, db: Session
) -> float | None:
    if not user_top5 or not spotify_top5:
        return None
    loss = compute_ranking_loss(user_top5, spotify_top5)
    stat = db.scalar(select(BaselineStat).where(BaselineStat.k == k))
    if stat is None:
        return None
    return compute_similarity_score(loss, stat.mean, stat.std)


@router.get("/{username}/comparison", response_model=FriendDashboardResponse)
def get_user_comparison(
    username: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    spotify: Annotated[SpotifyClient, Depends(get_spotify_client)],
) -> FriendDashboardResponse:
    """Live pair comparison between the current user (A) and any *viewable* user
    (B) — no friendship required. Same shape as the friend dashboard, computed on
    the fly from the intersection of both users' published ratings (nothing is
    persisted). Access follows the same visibility rules as the solo dashboard."""
    target = db.scalar(select(User).where(User.username == username))
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if target.username == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot compare with yourself"
        )
    require_can_view_profile(db, viewer=current_user, target=target)

    a, b = current_user.username, target.username
    a_ratings = {
        r.album_id: r
        for r in db.scalars(
            select(Rating).where(Rating.username == a, Rating.status == RatingStatus.published)
        )
    }
    b_ratings = {
        r.album_id: r
        for r in db.scalars(
            select(Rating).where(Rating.username == b, Rating.status == RatingStatus.published)
        )
    }
    mutual_album_ids = set(a_ratings) & set(b_ratings)

    entries: list[FriendDashboardEntryOut] = []
    for album_id in mutual_album_ids:
        ra = a_ratings[album_id]
        rb = b_ratings[album_id]
        album = db.get(Album, album_id)
        if album is None or ra.completed_at is None or rb.completed_at is None:
            continue

        if album.spotify_top5_indices is None:
            album.spotify_top5_indices = spotify.get_top5_popular_indices(album.spotify_id)
            db.add(album)
            db.commit()

        a_top = ra.top_track_indices or []
        b_top = rb.top_track_indices or []
        spotify_top = album.spotify_top5_indices or []

        entries.append(
            FriendDashboardEntryOut(
                album=DashboardAlbum.model_validate(album),
                mutual_date=max(ra.completed_at, rb.completed_at),
                similarity_users=_pair_similarity(db, a_top, b_top, album.total_songs),
                similarity_a_vs_spotify=_similarity_against_spotify(
                    user_top5=a_top, spotify_top5=spotify_top, k=album.total_songs, db=db
                ),
                similarity_b_vs_spotify=_similarity_against_spotify(
                    user_top5=b_top, spotify_top5=spotify_top, k=album.total_songs, db=db
                ),
                spotify_top5_indices=spotify_top,
                user_a_top_track_indices=a_top,
                user_b_top_track_indices=b_top,
                mean_score=(ra.score + rb.score) / 2,
                user_a_score=ra.score,
                user_b_score=rb.score,
            )
        )

    entries.sort(key=lambda e: e.mutual_date)
    return FriendDashboardResponse(
        friendship_id=None,
        user_a_username=a,
        user_b_username=b,
        entries=entries,
    )


def _pair_similarity(db: Session, a_top5: list[int], b_top5: list[int], k: int) -> float | None:
    """Similarity between two users' top-5s on one album (same math as the
    friend-dashboard build; see services/friend_dashboard._users_similarity)."""
    if not a_top5 or not b_top5:
        return None
    loss = compute_ranking_loss(a_top5, b_top5)
    stat = db.scalar(select(BaselineStat).where(BaselineStat.k == k))
    if stat is None:
        return None
    return compute_similarity_score(loss, stat.mean, stat.std)
