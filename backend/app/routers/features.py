"""Which optional features are switched on, for the frontend to adapt to.

Unauthenticated on purpose: the logged-out landing page describes what the app
does, so it needs to know before there is a session.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter(tags=["features"])


class Features(BaseModel):
    # "Your top 5 vs Spotify's most popular" on the dashboards. Currently off:
    # Spotify's Feb 2026 Development Mode changes removed track `popularity`
    # outright, so there is nothing to rank by. The frontend hides every
    # vs-Spotify surface when this is false rather than rendering empty ones.
    spotify_comparison: bool


@router.get("/features", response_model=Features)
def get_features() -> Features:
    return Features(spotify_comparison=get_settings().spotify_comparison_enabled)
