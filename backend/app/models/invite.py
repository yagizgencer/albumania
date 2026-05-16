import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ListenInviteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    completed = "completed"


class ListenInvite(Base):
    __tablename__ = "listen_invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_username: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True
    )
    receiver_username: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True
    )
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False, index=True)
    status: Mapped[ListenInviteStatus] = mapped_column(
        Enum(ListenInviteStatus), nullable=False, default=ListenInviteStatus.pending
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "sender_username", "receiver_username", "album_id", name="uq_listen_invite_pair_album"
        ),
    )
