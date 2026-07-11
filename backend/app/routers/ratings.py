from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.album_rules import require_rateable
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album
from app.models.rating import Rating, RatingStatus, SongNote
from app.models.user import User
from app.schemas.rating import RatingCreate, RatingOut, RatingPatch
from app.services.friend_dashboard import rebuild_for_user
from app.services.invite import (
    delete_invites_for_user_album,
    maybe_complete_invites_for_rating,
)

router = APIRouter(prefix="/ratings", tags=["ratings"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]

_WITH_NOTES = selectinload(Rating.notes)


def _get_rating_or_404(rating_id: int, db: Session) -> Rating:
    rating = db.scalar(
        select(Rating).options(_WITH_NOTES).where(Rating.id == rating_id)
    )
    if rating is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
    return rating


def _require_owner(rating: Rating, user: User) -> None:
    if rating.username != user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your rating")


def _require_complete(rating: Rating) -> None:
    """A rating can go live (publish/republish) only with a score and all 5
    top tracks filled in."""
    errors: list[str] = []
    if rating.score is None:
        errors.append("score is required")
    top = rating.top_track_indices or []
    if len(top) != 5 or any(i is None for i in top):
        errors.append("exactly 5 top tracks are required")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="; ".join(errors)
        )


@router.post("", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def create_rating(body: RatingCreate, user: CurrentUser, db: DB) -> Rating:
    album = db.scalar(select(Album).where(Album.id == body.album_id))
    if album is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    require_rateable(album)

    existing = db.scalar(
        select(Rating).where(Rating.username == user.username, Rating.album_id == body.album_id)
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Rating already exists for this album"
        )

    rating = Rating(username=user.username, album_id=body.album_id)
    db.add(rating)
    db.commit()
    db.refresh(rating)
    # load notes relationship (empty at creation)
    db.refresh(rating, ["notes"])
    return rating


@router.get("/me", response_model=list[RatingOut])
def list_my_ratings(user: CurrentUser, db: DB) -> list[Rating]:
    return list(
        db.scalars(
            select(Rating)
            .options(_WITH_NOTES)
            .where(Rating.username == user.username)
            .order_by(Rating.started_at.desc())
        )
    )


@router.get("/me/{album_id}", response_model=RatingOut)
def get_my_rating_for_album(album_id: int, user: CurrentUser, db: DB) -> Rating:
    rating = db.scalar(
        select(Rating)
        .options(_WITH_NOTES)
        .where(Rating.username == user.username, Rating.album_id == album_id)
    )
    if rating is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
    return rating


@router.patch("/{rating_id}", response_model=RatingOut)
def patch_rating(rating_id: int, body: RatingPatch, user: CurrentUser, db: DB) -> Rating:
    rating = _get_rating_or_404(rating_id, db)
    _require_owner(rating, user)

    if body.score is not None:
        rating.score = body.score
    elif body.score is None and "score" in body.model_fields_set and rating.status == RatingStatus.published:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot remove score from a published rating",
        )

    if body.top_track_indices is not None:
        if rating.status == RatingStatus.published and (
            len(body.top_track_indices) != 5
            or any(i is None for i in body.top_track_indices)
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Published rating must keep exactly 5 top tracks",
            )
        rating.top_track_indices = body.top_track_indices

    if body.notes is not None:
        existing_notes = {n.track_index: n for n in rating.notes}
        for track_index, text in body.notes.items():
            if text == "":
                # empty string removes the note
                if track_index in existing_notes:
                    db.delete(existing_notes[track_index])
            elif track_index in existing_notes:
                existing_notes[track_index].note_text = text
            else:
                db.add(SongNote(rating_id=rating.id, track_index=track_index, note_text=text))

    rating.last_edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rating, ["notes"])
    return rating


@router.post("/{rating_id}/publish", response_model=RatingOut)
def publish_rating(rating_id: int, user: CurrentUser, db: DB) -> Rating:
    rating = _get_rating_or_404(rating_id, db)
    _require_owner(rating, user)

    if rating.status == RatingStatus.published:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already published")

    _require_complete(rating)

    now = datetime.now(timezone.utc)
    rating.status = RatingStatus.published
    rating.completed_at = now
    rating.last_edited_at = now
    db.commit()
    db.refresh(rating, ["notes"])
    rebuild_for_user(db, user.username)
    maybe_complete_invites_for_rating(db, user.username, rating.album_id)
    return rating


@router.post("/{rating_id}/republish", response_model=RatingOut)
def republish_rating(rating_id: int, user: CurrentUser, db: DB) -> Rating:
    """Re-publish an already-published rating after edits. Unlike the first
    publish this deliberately does NOT notify a together-listened friend. Bumping
    completed_at moves the (single) feed entry to the top so the edit replaces the
    old publish as the most recent activity."""
    rating = _get_rating_or_404(rating_id, db)
    _require_owner(rating, user)

    if rating.status != RatingStatus.published:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Rating is not published",
        )

    _require_complete(rating)

    now = datetime.now(timezone.utc)
    rating.completed_at = now
    rating.last_edited_at = now
    db.commit()
    db.refresh(rating, ["notes"])
    rebuild_for_user(db, user.username)
    # Intentionally no maybe_complete_invites_for_rating: republishing must not
    # re-notify the friend we listened with.
    return rating


@router.delete("/{rating_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rating(rating_id: int, user: CurrentUser, db: DB) -> None:
    rating = _get_rating_or_404(rating_id, db)
    _require_owner(rating, user)
    was_published = rating.status == RatingStatus.published
    album_id = rating.album_id
    db.delete(rating)
    db.commit()
    delete_invites_for_user_album(db, user.username, album_id)
    if was_published:
        rebuild_for_user(db, user.username)
