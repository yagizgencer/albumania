from pydantic import BaseModel


class AlbumSearchResult(BaseModel):
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    release_date: str
    total_songs: int
    album_art_url: str | None


class AlbumStats(BaseModel):
    mean_score: float | None
    num_raters: int


class TrackOut(BaseModel):
    index: int
    name: str
    spotify_url: str | None
    duration_ms: int | None = None

    model_config = {"from_attributes": True}


class AlbumOut(BaseModel):
    id: int
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    release_date: str
    total_songs: int
    album_art_url: str | None
    tracks: list[TrackOut]

    model_config = {"from_attributes": True}
