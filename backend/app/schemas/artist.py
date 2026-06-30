from pydantic import BaseModel


class ArtistOut(BaseModel):
    spotify_id: str
    name: str
    image_url: str | None


class ArtistAlbumOut(BaseModel):
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    release_date: str
    total_songs: int
    album_art_url: str | None
    # The viewer's rating status for this album.
    status: str  # "none" | "draft" | "published"
    mean_score: float | None
    num_raters: int


class ArtistDetailOut(BaseModel):
    artist: ArtistOut
    albums: list[ArtistAlbumOut]
