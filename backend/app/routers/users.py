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

    is_owner = current_user.username == user.username
    if not is_owner:
        vis = user.profile_visibility
        if vis == ProfileVisibility.private:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Profile is private"
            )
        if vis == ProfileVisibility.friends and not are_friends(
            db, current_user.username, user.username
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Profile is visible to friends only"
            )

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
