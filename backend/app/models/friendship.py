import enum
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"


class Friendship(Base):
    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Ordered pair: user_a_username < user_b_username so each pair has at most one row.
    user_a_username: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True
    )
    user_b_username: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True
    )
    status: Mapped[FriendshipStatus] = mapped_column(
        Enum(FriendshipStatus), nullable=False, default=FriendshipStatus.pending
    )
    requested_by: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dashboard_entries: Mapped[list["FriendDashboardEntry"]] = relationship(
        "FriendDashboardEntry", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("user_a_username", "user_b_username", name="uq_friendship_pair"),
        CheckConstraint("user_a_username < user_b_username", name="ck_friendship_ordered_pair"),
    )


class FriendDashboardEntry(Base):
    __tablename__ = "friend_dashboard_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    friendship_id: Mapped[int] = mapped_column(
        ForeignKey("friendships.id", ondelete="CASCADE"), nullable=False, index=True
    )
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False, index=True)
    # Later of the two users' completed_at — the "rating date" the friend pair sees.
    mutual_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    similarity_users: Mapped[float | None] = mapped_column(Float, nullable=True)
    mean_score: Mapped[float] = mapped_column(Float, nullable=False)
    # Scores keyed by friendship ordered pair (user_a_username < user_b_username).
    user_a_score: Mapped[float] = mapped_column(Float, nullable=False)
    user_b_score: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint("friendship_id", "album_id", name="uq_friend_dashboard_entry_pair_album"),
    )
