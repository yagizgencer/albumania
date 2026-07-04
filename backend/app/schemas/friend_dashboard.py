from datetime import datetime

from pydantic import BaseModel

from app.schemas.dashboard import DashboardAlbum


class FriendDashboardEntryOut(BaseModel):
    album: DashboardAlbum
    mutual_date: datetime
    similarity_users: float | None
    similarity_a_vs_spotify: float | None
    similarity_b_vs_spotify: float | None
    spotify_top5_indices: list[int]
    user_a_top_track_indices: list[int]
    user_b_top_track_indices: list[int]
    mean_score: float
    user_a_score: float
    user_b_score: float


class FriendDashboardResponse(BaseModel):
    # Present for a friend comparison (precomputed); None for an ad-hoc comparison
    # between two arbitrary viewable users (computed live, no friendship row).
    friendship_id: int | None
    user_a_username: str
    user_b_username: str
    entries: list[FriendDashboardEntryOut]
