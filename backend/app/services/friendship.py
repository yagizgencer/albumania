from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.friendship import Friendship, FriendshipStatus


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
