from pydantic import BaseModel


class AlbumSearchResult(BaseModel):
    spotify_id: str
    title: str
    artist: str
    release_date: str
    total_songs: int
    album_art_url: str | None



class TrackOut(BaseModel):
    index: int
    name: str
    spotify_url: str | None

    model_config = {"from_attributes": True}


class AlbumOut(BaseModel):
    id: int
    spotify_id: str
    title: str
    artist: str
    release_date: str
    total_songs: int
    album_art_url: str | None
    tracks: list[TrackOut]

    model_config = {"from_attributes": True}
