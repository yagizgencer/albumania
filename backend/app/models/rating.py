import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class RatingStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class Rating(Base):
    __tablename__ = "ratings"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(ForeignKey("users.username"), nullable=False, index=True)
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False, index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Ordered list of up to 5 track indices (1-based), e.g. [3, 1, 7, 2, 9]
    top_track_indices: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[RatingStatus] = mapped_column(
        Enum(RatingStatus), nullable=False, default=RatingStatus.draft
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_edited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    notes: Mapped[list["SongNote"]] = relationship(
        "SongNote", back_populates="rating", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("username", "album_id", name="uq_rating_user_album"),)


class SongNote(Base):
    __tablename__ = "song_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    rating_id: Mapped[int] = mapped_column(ForeignKey("ratings.id"), nullable=False, index=True)
    track_index: Mapped[int] = mapped_column(Integer, nullable=False)
    note_text: Mapped[str] = mapped_column(Text, nullable=False)

    rating: Mapped["Rating"] = relationship("Rating", back_populates="notes")

    __table_args__ = (UniqueConstraint("rating_id", "track_index", name="uq_song_note_rating_track"),)