from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Artist(Base):
    """A durable mirror of the Spotify artist data we display.

    Exists so `/home/trending/artists` doesn't have to ask Spotify for a photo on
    every home-page load. Spotify's Feb 2026 Development Mode changes removed the
    batch "Get Several Artists" endpoint, so that endpoint had degraded into up to
    20 sequential HTTP requests per page view.

    There's an in-process TTL cache in front of this too, but that dies on every
    redeploy — this table is what makes the cache survive a restart.
    """

    __tablename__ = "artists"

    spotify_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # When we last read this from Spotify. Nothing expires on it today; it's here
    # so a future refresh job can find stale rows without guessing.
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
