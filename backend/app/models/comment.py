import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class CommentVisibility(str, enum.Enum):
    """Controls *identity* visibility, not the comment text (which is always
    shown). `public` reveals the author to everyone; `friends` reveals to the
    author's friends only; `private` reveals to the author only."""

    public = "public"
    friends = "friends"
    private = "private"


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False, index=True)
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[CommentVisibility] = mapped_column(
        Enum(CommentVisibility), nullable=False, default=CommentVisibility.public
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Set the first time the comment is edited; presence renders "(edited)".
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reactions: Mapped[list["CommentReaction"]] = relationship(
        "CommentReaction", back_populates="comment", cascade="all, delete-orphan"
    )


class CommentReaction(Base):
    __tablename__ = "comment_reactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    username: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False, index=True)
    # +1 for a thumbs-up, -1 for a thumbs-down. Net score = sum(value).
    value: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    comment: Mapped["Comment"] = relationship("Comment", back_populates="reactions")

    __table_args__ = (UniqueConstraint("comment_id", "username", name="uq_comment_reaction_user"),)
