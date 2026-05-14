from sqlalchemy import Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[int] = mapped_column(primary_key=True)
    spotify_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    artist: Mapped[str] = mapped_column(String(255), nullable=False)
    release_date: Mapped[str] = mapped_column(String(20), nullable=False)
    total_songs: Mapped[int] = mapped_column(Integer, nullable=False)
    album_art_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    tracks: Mapped[list["AlbumTrack"]] = relationship(
        "AlbumTrack", back_populates="album", order_by="AlbumTrack.index"
    )


class AlbumTrack(Base):
    __tablename__ = "album_tracks"

    id: Mapped[int] = mapped_column(primary_key=True)
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id"), nullable=False, index=True)
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    spotify_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    album: Mapped["Album"] = relationship("Album", back_populates="tracks")

    __table_args__ = (UniqueConstraint("album_id", "index", name="uq_album_track_index"),)


class BaselineStat(Base):
    __tablename__ = "baseline_stats"

    k: Mapped[int] = mapped_column(Integer, primary_key=True)
    mean: Mapped[float] = mapped_column(Float, nullable=False)
    std: Mapped[float] = mapped_column(Float, nullable=False)
