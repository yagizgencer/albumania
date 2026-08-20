from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.friendship import Friendship, FriendshipStatus


def accepted_friend_usernames(db: Session, username: str) -> set[str]:
    """Everyone `username` is actually friends with, in one query.

    Use this instead of calling `are_friends` in a loop — the comment list was
    firing one query per comment to answer the same question.
    """
    rows = db.execute(
        select(Friendship.user_a_username, Friendship.user_b_username).where(
            Friendship.status == FriendshipStatus.accepted,
            or_(
                Friendship.user_a_username == username,
                Friendship.user_b_username == username,
            ),
        )
    ).all()
    return {b if a == username else a for a, b in rows}


def ordered_pair(a: str, b: str) -> tuple[str, str]:
    """Return (user_a, user_b) such that user_a < user_b — the canonical storage order."""
    return (a, b) if a < b else (b, a)


def get_friendship(db: Session, user1: str, user2: str) -> Friendship | None:
    a, b = ordered_pair(user1, user2)
    return db.scalar(
        select(Friendship).where(
            Friendship.user_a_username == a, Friendship.user_b_username == b
        )
    )


def are_friends(db: Session, user1: str, user2: str) -> bool:
    if user1 == user2:
        return False
    f = get_friendship(db, user1, user2)
    return f is not None and f.status == FriendshipStatus.accepted
