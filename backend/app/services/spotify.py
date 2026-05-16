from dataclasses import dataclass

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from app.core.config import get_settings


@dataclass
class SpotifyAlbumResult:
    spotify_id: str
    title: str
    artist: str
    release_date: str
    total_songs: int
    album_art_url: str | None


@dataclass
class SpotifyTrack:
    index: int
    name: str
    spotify_url: str | None
    duration_ms: int | None


class SpotifyClient:
    def __init__(self) -> None:
        settings = get_settings()
        auth = SpotifyClientCredentials(
            client_id=settings.spotify_client_id,
            client_secret=settings.spotify_client_secret,
        )
        self._sp = spotipy.Spotify(auth_manager=auth)

    def search_albums(self, query: str, limit: int = 10) -> list[SpotifyAlbumResult]:
        data = self._sp.search(q=query, type="album", limit=limit)
        items = data["albums"]["items"]
        results = []
        for item in items:
            results.append(
                SpotifyAlbumResult(
                    spotify_id=item["id"],
                    title=item["name"],
                    artist=item["artists"][0]["name"] if item["artists"] else "",
                    release_date=item["release_date"],
                    total_songs=item["total_tracks"],
                    album_art_url=item["images"][0]["url"] if item["images"] else None,
                )
            )
        return results

    def get_album(self, spotify_id: str) -> SpotifyAlbumResult:
        item = self._sp.album(spotify_id)
        return SpotifyAlbumResult(
            spotify_id=item["id"],
            title=item["name"],
            artist=item["artists"][0]["name"] if item["artists"] else "",
            release_date=item["release_date"],
            total_songs=item["total_tracks"],
            album_art_url=item["images"][0]["url"] if item["images"] else None,
        )

    def get_album_tracks(self, spotify_id: str) -> list[SpotifyTrack]:
        item = self._sp.album(spotify_id)
        tracks = []
        for track in item["tracks"]["items"]:
            tracks.append(
                SpotifyTrack(
                    index=track["track_number"],
                    name=track["name"],
                    spotify_url=track["external_urls"].get("spotify"),
                    duration_ms=track.get("duration_ms"),
                )
            )
        return tracks

    def get_top5_popular_indices(self, spotify_id: str) -> list[int]:
        """Return the 5 most-popular track numbers (1-based) for the album, sorted by popularity desc."""
        album = self._sp.album(spotify_id)
        track_ids = [t["id"] for t in album["tracks"]["items"]]
        track_numbers = {t["id"]: t["track_number"] for t in album["tracks"]["items"]}

        popularity_map: dict[str, int] = {}
        # Spotify's tracks endpoint accepts up to 50 IDs at once
        for i in range(0, len(track_ids), 50):
            batch = track_ids[i : i + 50]
            results = self._sp.tracks(batch)["tracks"]
            for t in results:
                if t:
                    popularity_map[t["id"]] = t["popularity"]

        sorted_tracks = sorted(track_ids, key=lambda tid: popularity_map.get(tid, 0), reverse=True)
        return [track_numbers[tid] for tid in sorted_tracks[:5]]


def get_spotify_client() -> SpotifyClient:
    return SpotifyClient()
