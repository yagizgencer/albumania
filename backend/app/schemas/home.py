from datetime import datetime
from typing import Literal

from pydantic import BaseModel

FeedType = Literal[
    "you_rated",
    "friend_rated",
    "you_commented",
    "friend_commented",
    "new_friend",
]


class FeedActor(BaseModel):
    username: str
    display_name: str
    picture_url: str | None


class FeedAlbum(BaseModel):
    spotify_id: str
    title: str
    artist: str
    album_art_url: str | None


class FeedItem(BaseModel):
    id: str  # e.g. "rating-12" — stable key across sources
    type: FeedType
    created_at: datetime
    actor: FeedActor
    album: FeedAlbum | None = None
    score: float | None = None
    excerpt: str | None = None


class FeedPage(BaseModel):
    items: list[FeedItem]
    next_before: datetime | None


class TrendingAlbum(BaseModel):
    rank: int
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    album_art_url: str | None
    rating_count: int
    mean_score: float | None
    num_raters: int


class TrendingArtist(BaseModel):
    rank: int
    artist_spotify_id: str
    name: str
    image_url: str | None
    rating_count: int
