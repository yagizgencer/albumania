from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.album import Album
from app.models.comment import Comment, CommentVisibility
from app.models.friendship import Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.models.user import User
from app.schemas.home import (
    FeedActor,
    FeedAlbum,
    FeedItem,
    FeedPage,
    TrendingAlbum,
    TrendingArtist,
)
from app.services.avatars import picture_url
from app.services.storage import Storage, get_storage
from app.services.spotify import SpotifyClient, get_spotify_client

router = APIRouter(tags=["home"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[Session, Depends(get_db)]
StorageDep = Annotated[Storage, Depends(get_storage)]
SpotifyDep = Annotated[SpotifyClient, Depends(get_spotify_client)]

Period = Literal["week", "month", "year", "all"]


# ---------------------------------------------------------------------------
# Feed
# ---------------------------------------------------------------------------

def _accepted_friends(db: Session, username: str) -> list[str]:
    rows = db.scalars(
        select(Friendship).where(
            or_(
                Friendship.user_a_username == username,
                Friendship.user_b_username == username,
            ),
            Friendship.status == FriendshipStatus.accepted,
        )
    ).all()
    return [
        f.user_b_username if f.user_a_username == username else f.user_a_username
        for f in rows
    ]


def _excerpt(text: str, n: int = 140) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= n else flat[:n].rstrip() + "…"


def _feed_album(album: Album) -> FeedAlbum:
    return FeedAlbum(
        spotify_id=album.spotify_id,
        title=album.title,
        artist=album.artist,
        album_art_url=album.album_art_url,
    )


FeedCategory = Literal["ratings", "comments", "friends"]


@router.get("/home/feed", response_model=FeedPage)
def get_feed(
    user: CurrentUser,
    db: DB,
    storage: StorageDep,
    before: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    types: Annotated[list[FeedCategory] | None, Query()] = None,
) -> FeedPage:
    """Merged reverse-chronological timeline of the viewer's and their friends'
    final events (ratings, comments, new friendships). Paginated by `before`.

    `types` narrows the feed to a subset of activity categories; omitting it (or
    passing none) returns every category."""
    cutoff = before or datetime.now(timezone.utc)
    friends = _accepted_friends(db, user.username)
    feed_users = [user.username, *friends]

    def wants(category: FeedCategory) -> bool:
        return not types or category in types

    # Each source contributes at most `limit` rows below the cursor; the merged
    # top `limit` is then the globally newest page.
    candidates: list[dict] = []

    if wants("ratings"):
        for rating, album in db.execute(
            select(Rating, Album)
            .join(Album, Album.id == Rating.album_id)
            .where(
                Rating.status == RatingStatus.published,
                Rating.completed_at.is_not(None),
                Rating.completed_at < cutoff,
                Rating.username.in_(feed_users),
            )
            .order_by(Rating.completed_at.desc())
            .limit(limit)
        ):
            mine = rating.username == user.username
            candidates.append(
                {
                    "id": f"rating-{rating.id}",
                    "type": "you_rated" if mine else "friend_rated",
                    "ts": rating.completed_at,
                    "actor": rating.username,
                    "album": album,
                    "score": rating.score,
                    "excerpt": None,
                }
            )

    if wants("comments"):
        for comment, album in db.execute(
            select(Comment, Album)
            .join(Album, Album.id == Comment.album_id)
            .where(Comment.created_at < cutoff, Comment.username.in_(feed_users))
            .order_by(Comment.created_at.desc())
            .limit(limit)
        ):
            mine = comment.username == user.username
            # A friend's comment only surfaces when its identity is visible to us —
            # friends see public + friends-only, never private. (Own always shows.)
            if not mine and comment.visibility == CommentVisibility.private:
                continue
            candidates.append(
                {
                    "id": f"comment-{comment.id}",
                    "type": "you_commented" if mine else "friend_commented",
                    "ts": comment.created_at,
                    "actor": comment.username,
                    "album": album,
                    "score": None,
                    "excerpt": _excerpt(comment.text),
                }
            )

    if wants("friends"):
        for f in db.execute(
            select(Friendship)
            .where(
                or_(
                    Friendship.user_a_username == user.username,
                    Friendship.user_b_username == user.username,
                ),
                Friendship.status == FriendshipStatus.accepted,
                Friendship.accepted_at.is_not(None),
                Friendship.accepted_at < cutoff,
            )
            .order_by(Friendship.accepted_at.desc())
            .limit(limit)
        ).scalars():
            other = f.user_b_username if f.user_a_username == user.username else f.user_a_username
            candidates.append(
                {
                    "id": f"friend-{f.id}",
                    "type": "new_friend",
                    "ts": f.accepted_at,
                    "actor": other,
                    "album": None,
                    "score": None,
                    "excerpt": None,
                }
            )

    candidates.sort(key=lambda c: c["ts"], reverse=True)
    page = candidates[:limit]

    # Hydrate actor display name + avatar for the returned page only.
    actor_names = {c["actor"] for c in page}
    info: dict[str, tuple[str, str | None]] = {}
    if actor_names:
        for username, display_name, key in db.execute(
            select(User.username, User.display_name, User.profile_picture_key).where(
                User.username.in_(actor_names)
            )
        ):
            info[username] = (display_name, picture_url(storage, key))

    items = [
        FeedItem(
            id=c["id"],
            type=c["type"],
            created_at=c["ts"],
            actor=FeedActor(
                username=c["actor"],
                display_name=info.get(c["actor"], (c["actor"], None))[0],
                picture_url=info.get(c["actor"], (c["actor"], None))[1],
            ),
            album=_feed_album(c["album"]) if c["album"] is not None else None,
            score=c["score"],
            excerpt=c["excerpt"],
        )
        for c in page
    ]

    next_before = items[-1].created_at if len(items) == limit else None
    return FeedPage(items=items, next_before=next_before)


# ---------------------------------------------------------------------------
# Trending
# ---------------------------------------------------------------------------

def _cutoff(period: Period) -> datetime | None:
    now = datetime.now(timezone.utc)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    if period == "year":
        return now - timedelta(days=365)
    return None  # all-time


@router.get("/trending/albums", response_model=list[TrendingAlbum])
def trending_albums(
    _user: CurrentUser,
    db: DB,
    period: Annotated[Period, Query()] = "all",
) -> list[TrendingAlbum]:
    cutoff = _cutoff(period)
    q = select(Rating.album_id, func.count(Rating.id).label("cnt")).where(
        Rating.status == RatingStatus.published,
        Rating.score.is_not(None),
    )
    if cutoff is not None:
        q = q.where(Rating.completed_at >= cutoff)
    q = (
        q.group_by(Rating.album_id)
        .order_by(func.count(Rating.id).desc(), Rating.album_id)
        .limit(20)
    )
    rows = db.execute(q).all()
    if not rows:
        return []

    album_ids = [aid for aid, _ in rows]
    albums = {a.id: a for a in db.scalars(select(Album).where(Album.id.in_(album_ids)))}

    # Global (all-time) mean + rater count, same figure as the album page.
    stats: dict[int, tuple[float | None, int]] = {}
    for aid, mean, num in db.execute(
        select(Rating.album_id, func.avg(Rating.score), func.count(Rating.id))
        .where(
            Rating.album_id.in_(album_ids),
            Rating.status == RatingStatus.published,
            Rating.score.is_not(None),
        )
        .group_by(Rating.album_id)
    ):
        stats[aid] = (mean, num)

    out: list[TrendingAlbum] = []
    for rank, (aid, cnt) in enumerate(rows, start=1):
        album = albums.get(aid)
        if album is None:
            continue
        mean, num = stats.get(aid, (None, 0))
        out.append(
            TrendingAlbum(
                rank=rank,
                spotify_id=album.spotify_id,
                title=album.title,
                artist=album.artist,
                artist_spotify_id=album.artist_spotify_id,
                album_art_url=album.album_art_url,
                rating_count=cnt,
                mean_score=round(mean, 2) if mean is not None else None,
                num_raters=num,
            )
        )
    return out


@router.get("/trending/artists", response_model=list[TrendingArtist])
def trending_artists(
    _user: CurrentUser,
    db: DB,
    spotify: SpotifyDep,
    period: Annotated[Period, Query()] = "all",
) -> list[TrendingArtist]:
    cutoff = _cutoff(period)
    q = (
        select(
            Album.artist_spotify_id,
            func.count(Rating.id).label("cnt"),
            func.max(Album.artist).label("name"),
        )
        .join(Album, Album.id == Rating.album_id)
        .where(
            Rating.status == RatingStatus.published,
            Rating.score.is_not(None),
            Album.artist_spotify_id.is_not(None),
        )
    )
    if cutoff is not None:
        q = q.where(Rating.completed_at >= cutoff)
    q = (
        q.group_by(Album.artist_spotify_id)
        .order_by(func.count(Rating.id).desc(), Album.artist_spotify_id)
        .limit(20)
    )
    rows = db.execute(q).all()
    if not rows:
        return []

    ids = [aid for aid, _, _ in rows]
    images = spotify.get_artists(ids)  # single batched Spotify call
    return [
        TrendingArtist(
            rank=rank,
            artist_spotify_id=aid,
            name=name,
            image_url=images.get(aid),
            rating_count=cnt,
        )
        for rank, (aid, cnt, name) in enumerate(rows, start=1)
    ]
