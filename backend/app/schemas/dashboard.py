from datetime import datetime

from pydantic import BaseModel


class DashboardAlbum(BaseModel):
    id: int
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    release_date: str
    total_songs: int
    album_art_url: str | None

    model_config = {"from_attributes": True}


class DashboardEntry(BaseModel):
    album: DashboardAlbum
    score: float
    top_track_indices: list[int]
    spotify_top5_indices: list[int]
    similarity_user_vs_spotify: float | None
    completed_at: datetime


class DashboardResponse(BaseModel):
    username: str
    entries: list[DashboardEntry]
