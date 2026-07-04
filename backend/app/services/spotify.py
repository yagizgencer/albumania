from dataclasses import dataclass

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials

from app.core.config import get_settings


@dataclass
class SpotifyAlbumResult:
    spotify_id: str
    title: str
    artist: str
    artist_spotify_id: str | None
    release_date: str
    total_songs: int
    album_art_url: str | None
    # UPC barcode from external_ids. Only present on the full album fetch
    # (get_album); None for search / artist-listing results.
    upc: str | None = None


@dataclass
class SpotifyArtist:
    spotify_id: str
    name: str
    image_url: str | None


@dataclass
class SpotifyTrack:
    index: int
    name: str
    spotify_url: str | None
    duration_ms: int | None


def _album_result_from_item(item: dict) -> SpotifyAlbumResult:
    artists = item.get("artists") or []
    return SpotifyAlbumResult(
        spotify_id=item["id"],
        title=item["name"],
        artist=artists[0]["name"] if artists else "",
        artist_spotify_id=artists[0]["id"] if artists else None,
        release_date=item["release_date"],
        total_songs=item["total_tracks"],
        album_art_url=item["images"][0]["url"] if item["images"] else None,
        upc=(item.get("external_ids") or {}).get("upc"),
    )


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
        return [_album_result_from_item(item) for item in data["albums"]["items"]]

    def search_artists(self, query: str, limit: int = 10) -> list[SpotifyArtist]:
        data = self._sp.search(q=query, type="artist", limit=limit)
        results = []
        for item in data["artists"]["items"]:
            results.append(
                SpotifyArtist(
                    spotify_id=item["id"],
                    name=item["name"],
                    image_url=item["images"][0]["url"] if item["images"] else None,
                )
            )
        return results

    def get_album(self, spotify_id: str) -> SpotifyAlbumResult:
        return _album_result_from_item(self._sp.album(spotify_id))

    def get_artist(self, artist_id: str) -> SpotifyArtist:
        item = self._sp.artist(artist_id)
        return SpotifyArtist(
            spotify_id=item["id"],
            name=item["name"],
            image_url=item["images"][0]["url"] if item["images"] else None,
        )

    def get_artists(self, artist_ids: list[str]) -> dict[str, str | None]:
        """Batch `artist_id -> image_url` lookup (Spotify's `artists` endpoint takes
        up to 50 ids per call). Used to attach photos to trending artists."""
        images: dict[str, str | None] = {}
        for i in range(0, len(artist_ids), 50):
            batch = artist_ids[i : i + 50]
            for item in self._sp.artists(batch)["artists"]:
                if item:
                    images[item["id"]] = item["images"][0]["url"] if item["images"] else None
        return images

    def get_artist_albums(self, artist_id: str) -> list[SpotifyAlbumResult]:
        """Full studio-album discography, de-duped by name (Spotify returns many
        editions: deluxe, remasters, regional variants, etc.)."""
        data = self._sp.artist_albums(artist_id, album_type="album", limit=50)
        results: list[SpotifyAlbumResult] = []
        seen_names: set[str] = set()
        for item in data["items"]:
            name_key = item["name"].strip().lower()
            if name_key in seen_names:
                continue
            seen_names.add(name_key)
            results.append(_album_result_from_item(item))
        return results

    def get_album_tracks(self, spotify_id: str) -> list[SpotifyTrack]:
        # The album object only embeds the first 50 tracks, so page through the
        # dedicated endpoint to get every track for long albums.
        tracks = []
        offset = 0
        while True:
            page = self._sp.album_tracks(spotify_id, limit=50, offset=offset)
            items = page["items"]
            for track in items:
                tracks.append(
                    SpotifyTrack(
                        index=track["track_number"],
                        name=track["name"],
                        spotify_url=track["external_urls"].get("spotify"),
                        duration_ms=track.get("duration_ms"),
                    )
                )
            if len(items) < 50 or not page.get("next"):
                break
            offset += 50
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
