from datetime import datetime

from sqlalchemy import DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SpotifyCooldown(Base):
    """A single row recording when we may next call Spotify.

    Exists because the rate-limit breaker was in-process only, and Spotify's
    penalties are long — an observed Retry-After was 58192s (16 hours), and
    Spotify's own guidance warns that resuming traffic during a penalty window
    triggers a fresh, longer lockout.

    A Render restart (deploy, crash, config change) happens far more often than
    once per 16 hours, and each one would have wiped the in-memory cooldown and
    resumed calling mid-penalty. Persisting it is what makes the backoff
    survive the thing most likely to interrupt it.
    """

    __tablename__ = "spotify_cooldown"

    # Always 1: this is a singleton row, not a log.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    paused_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
