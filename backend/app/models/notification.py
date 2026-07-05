import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class NotificationType(str, enum.Enum):
    friend_request = "friend_request"
    friend_accept = "friend_accept"
    listen_invite = "listen_invite"
    listen_invite_accepted = "listen_invite_accepted"
    friend_published = "friend_published"
    comment_liked = "comment_liked"


class Notification(Base):
    """One row per "something happened to a user" event. The badge counts on
    Listen Later / Friends / the bell are derived by counting unread rows
    filtered by type. Marking-seen flips `read` to True; we never delete
    rows just because the user dismissed them.

    Cascading deletes on the related entity (friendship or invite) wipe the
    notification automatically — that keeps the badge honest when, e.g., a
    pending friend request is cancelled before the recipient ever sees it.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_username: Mapped[str] = mapped_column(
        ForeignKey("users.username"), nullable=False, index=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType), nullable=False
    )
    actor_username: Mapped[str | None] = mapped_column(
        ForeignKey("users.username"), nullable=True
    )
    friendship_id: Mapped[int | None] = mapped_column(
        ForeignKey("friendships.id", ondelete="CASCADE"), nullable=True, index=True
    )
    invite_id: Mapped[int | None] = mapped_column(
        ForeignKey("listen_invites.id", ondelete="CASCADE"), nullable=True, index=True
    )
    album_id: Mapped[int | None] = mapped_column(
        ForeignKey("albums.id"), nullable=True
    )
    comment_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
