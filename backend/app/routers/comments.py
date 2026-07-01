from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album
from app.models.comment import Comment, CommentReaction, CommentVisibility
from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.schemas.comment import (
    CommentCreate,
    CommentOut,
    CommentReactionIn,
    CommentReactionOut,
    CommentUpdate,
    CommentAuthorOut,
)
from app.services.avatars import picture_url
from app.services.friendship import are_friends
from app.services.notifications import create_notification
from app.services.storage import Storage, get_storage

router = APIRouter(tags=["comments"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
StorageDep = Annotated[Storage, Depends(get_storage)]


def _likes(comment: Comment) -> int:
    return sum(1 for r in comment.reactions if r.value > 0)


def _dislikes(comment: Comment) -> int:
    return sum(1 for r in comment.reactions if r.value < 0)


def _viewer_reaction(comment: Comment, viewer: str) -> Literal["up", "down"] | None:
    for r in comment.reactions:
        if r.username == viewer:
            return "up" if r.value > 0 else "down"
    return None


def _author_visible(comment: Comment, viewer: str, db: Session) -> bool:
    if comment.username == viewer:
        return True
    if comment.visibility == CommentVisibility.public:
        return True
    if comment.visibility == CommentVisibility.friends:
        return are_friends(db, viewer, comment.username)
    return False  # private → only the author (handled above)


def _to_comment_out(
    comment: Comment,
    viewer: str,
    db: Session,
    storage: Storage,
    author_info: dict[str, tuple[str, str | None]],
) -> CommentOut:
    author: CommentAuthorOut | None = None
    if _author_visible(comment, viewer, db):
        display_name, key = author_info.get(comment.username, (comment.username, None))
        author = CommentAuthorOut(
            username=comment.username,
            display_name=display_name,
            picture_url=picture_url(storage, key),
        )
    return CommentOut(
        id=comment.id,
        text=comment.text,
        visibility=comment.visibility,
        author=author,
        is_mine=comment.username == viewer,
        created_at=comment.created_at,
        edited_at=comment.edited_at,
        likes=_likes(comment),
        dislikes=_dislikes(comment),
        viewer_reaction=_viewer_reaction(comment, viewer),
    )


def _author_info(db: Session, usernames: set[str]) -> dict[str, tuple[str, str | None]]:
    """username -> (display_name, profile_picture_key) for the given users."""
    if not usernames:
        return {}
    rows = db.execute(
        select(User.username, User.display_name, User.profile_picture_key).where(
            User.username.in_(usernames)
        )
    ).all()
    return {u: (dn, key) for u, dn, key in rows}


def _get_album_or_404(db: Session, spotify_id: str) -> Album:
    album = db.scalar(select(Album).where(Album.spotify_id == spotify_id))
    if album is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    return album


def _get_comment_or_404(db: Session, comment_id: int) -> Comment:
    comment = db.scalar(
        select(Comment).options(selectinload(Comment.reactions)).where(Comment.id == comment_id)
    )
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    return comment


@router.get("/albums/{spotify_id}/comments", response_model=list[CommentOut])
def list_comments(
    spotify_id: str,
    user: CurrentUser,
    db: DB,
    storage: StorageDep,
    sort: Annotated[Literal["recent", "score"], Query()] = "recent",
    order: Annotated[Literal["asc", "desc"], Query()] = "desc",
) -> list[CommentOut]:
    album = db.scalar(select(Album).where(Album.spotify_id == spotify_id))
    if album is None:
        return []

    comments = list(
        db.scalars(
            select(Comment)
            .options(selectinload(Comment.reactions))
            .where(Comment.album_id == album.id)
        )
    )
    info = _author_info(db, {c.username for c in comments})
    out = [_to_comment_out(c, user.username, db, storage, info) for c in comments]

    reverse = order == "desc"
    if sort == "score":
        out.sort(key=lambda c: (c.likes, c.created_at), reverse=reverse)
    else:
        out.sort(key=lambda c: c.created_at, reverse=reverse)
    return out


@router.post(
    "/albums/{spotify_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    spotify_id: str,
    body: CommentCreate,
    user: CurrentUser,
    db: DB,
    storage: StorageDep,
) -> CommentOut:
    album = _get_album_or_404(db, spotify_id)
    comment = Comment(
        username=user.username,
        album_id=album.id,
        text=body.text,
        visibility=body.visibility,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    db.refresh(comment, ["reactions"])
    info = _author_info(db, {comment.username})
    return _to_comment_out(comment, user.username, db, storage, info)


@router.patch("/comments/{comment_id}", response_model=CommentOut)
def update_comment(
    comment_id: int,
    body: CommentUpdate,
    user: CurrentUser,
    db: DB,
    storage: StorageDep,
) -> CommentOut:
    comment = _get_comment_or_404(db, comment_id)
    if comment.username != user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your comment")

    data = body.model_dump(exclude_unset=True)
    changed = False
    if "text" in data and data["text"] is not None:
        comment.text = data["text"]
        changed = True
    if "visibility" in data and data["visibility"] is not None:
        comment.visibility = data["visibility"]
        changed = True
    if changed:
        comment.edited_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(comment)
        db.refresh(comment, ["reactions"])

    info = _author_info(db, {comment.username})
    return _to_comment_out(comment, user.username, db, storage, info)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: int, user: CurrentUser, db: DB) -> None:
    comment = _get_comment_or_404(db, comment_id)
    if comment.username != user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your comment")
    db.delete(comment)
    db.commit()


@router.put("/comments/{comment_id}/reaction", response_model=CommentReactionOut)
def react_to_comment(
    comment_id: int,
    body: CommentReactionIn,
    user: CurrentUser,
    db: DB,
) -> CommentReactionOut:
    comment = _get_comment_or_404(db, comment_id)
    existing = db.scalar(
        select(CommentReaction).where(
            CommentReaction.comment_id == comment_id,
            CommentReaction.username == user.username,
        )
    )

    target = 1 if body.value == "up" else -1 if body.value == "down" else None
    became_like = False
    if target is None:
        if existing is not None:
            db.delete(existing)
    elif existing is None:
        db.add(CommentReaction(comment_id=comment_id, username=user.username, value=target))
        became_like = target == 1
    else:
        became_like = target == 1 and existing.value != 1
        existing.value = target

    # Notify the author when their comment gets a new like (anonymously — no
    # actor is stored). Skip self-likes and collapse repeat likes into one
    # unread notification per comment.
    if became_like and comment.username != user.username:
        already = db.scalar(
            select(Notification).where(
                Notification.recipient_username == comment.username,
                Notification.type == NotificationType.comment_liked,
                Notification.comment_id == comment.id,
                Notification.read.is_(False),
            )
        )
        if already is None:
            create_notification(
                db,
                recipient_username=comment.username,
                type=NotificationType.comment_liked,
                actor_username=None,
                album_id=comment.album_id,
                comment_id=comment.id,
            )

    db.commit()
    db.refresh(comment, ["reactions"])
    return CommentReactionOut(
        likes=_likes(comment),
        dislikes=_dislikes(comment),
        viewer_reaction=_viewer_reaction(comment, user.username),
    )
