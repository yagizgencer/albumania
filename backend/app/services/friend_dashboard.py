from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.album import Album, BaselineStat
from app.models.friendship import FriendDashboardEntry, Friendship, FriendshipStatus
from app.models.rating import Rating, RatingStatus
from app.services.similarity import compute_ranking_loss, compute_similarity_score


def rebuild_for_pair(db: Session, friendship_id: int) -> None:
    """Recompute the FriendDashboardEntry rows for one friendship.

    Wipes existing rows and re-derives them from the intersection of both users'
    currently-published ratings. Called from rating publish/delete and friendship accept.
    Safe to call on a pending friendship (it just clears any stale rows).
    """
    friendship = db.get(Friendship, friendship_id)
    if friendship is None:
        return

    db.query(FriendDashboardEntry).filter(
        FriendDashboardEntry.friendship_id == friendship_id
    ).delete(synchronize_session=False)

    if friendship.status != FriendshipStatus.accepted:
        db.commit()
        return

    a, b = friendship.user_a_username, friendship.user_b_username
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

    for album_id in mutual_album_ids:
        ra = a_ratings[album_id]
        rb = b_ratings[album_id]
        album = db.get(Album, album_id)
        if album is None or ra.completed_at is None or rb.completed_at is None:
            continue

        similarity = _users_similarity(db, ra.top_track_indices or [], rb.top_track_indices or [], album.total_songs)

        entry = FriendDashboardEntry(
            friendship_id=friendship_id,
            album_id=album_id,
            mutual_date=max(ra.completed_at, rb.completed_at),
            similarity_users=similarity,
            mean_score=(ra.score + rb.score) / 2,
            user_a_score=ra.score,
            user_b_score=rb.score,
        )
        db.add(entry)

    db.commit()


def rebuild_for_user(db: Session, username: str) -> None:
    """Rebuild every accepted friendship that includes this user."""
    rows = db.scalars(
        select(Friendship).where(
            (Friendship.user_a_username == username) | (Friendship.user_b_username == username),
            Friendship.status == FriendshipStatus.accepted,
        )
    ).all()
    for f in rows:
        rebuild_for_pair(db, f.id)


def _users_similarity(db: Session, a_top5: list[int], b_top5: list[int], k: int) -> float | None:
    if not a_top5 or not b_top5:
        return None
    loss = compute_ranking_loss(a_top5, b_top5)
    stat = db.scalar(select(BaselineStat).where(BaselineStat.k == k))
    if stat is None:
        return None
    return compute_similarity_score(loss, stat.mean, stat.std)
