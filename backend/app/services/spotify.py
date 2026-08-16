from dataclasses import dataclass

import spotipy
from spotipy.exceptions import SpotifyException
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
        """`artist_id -> image_url` lookup. Used to attach photos to trending
        artists. One request per artist, not batched — Spotify's February 2026
        Development Mode changes removed the batch "Get Several Artists"
        endpoint (`GET /artists?ids=...`) for newly created apps; the
        single-item endpoint remains supported, so this fetches one at a time
        instead (see the migration guide's "fetch items individually instead").
        An id that fails on its own (bad id, transient error) is skipped
        rather than failing the whole lookup, matching the batch endpoint's
        original behaviour of silently omitting unresolvable ids."""
        images: dict[str, str | None] = {}
        for artist_id in artist_ids:
            try:
                item = self._sp.artist(artist_id)
            except SpotifyException:
                continue
            if item:
                images[item["id"]] = item["images"][0]["url"] if item["images"] else None
        return images

    def get_artist_albums(self, artist_id: str) -> list[SpotifyAlbumResult]:
        """Full studio-album discography, de-duped by name (Spotify returns many
        editions: deluxe, remasters, regional variants, etc.). Paginated at 10
        per page — Spotify's February 2026 Development Mode changes reject
        limit=50 outright with a 400 "Invalid limit" for newly created apps,
        so this can no longer fetch everything in one call."""
        results: list[SpotifyAlbumResult] = []
        seen_names: set[str] = set()
        offset = 0
        while True:
            data = self._sp.artist_albums(
                artist_id, album_type="album", limit=10, offset=offset
            )
            items = data["items"]
            for item in items:
                name_key = item["name"].strip().lower()
                if name_key in seen_names:
                    continue
                seen_names.add(name_key)
                results.append(_album_result_from_item(item))
            if len(items) < 10 or not data.get("next"):
                break
            offset += 10
        return results

    def get_album_tracks(self, spotify_id: str) -> list[SpotifyTrack]:
        # The album object only embeds the first 50 tracks, so page through the
        # dedicated endpoint to get every track for long albums. Page size is 10,
        # not 50 — Spotify's February 2026 Development Mode changes reject
        # limit=50 outright with a 400 "Invalid limit" for newly created apps.
        tracks = []
        offset = 0
        while True:
            page = self._sp.album_tracks(spotify_id, limit=10, offset=offset)
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
            if len(items) < 10 or not page.get("next"):
                break
            offset += 10
        return tracks

    def get_top5_popular_indices(self, spotify_id: str) -> list[int]:
        """Return the 5 most-popular track numbers (1-based) for the album, sorted
        by popularity desc. One request per track, not batched — see
        get_artists()'s docstring for why (Spotify's Feb 2026 Development Mode
        changes removed the batch "Get Several Tracks" endpoint for newly
        created apps; the single-item endpoint remains supported)."""
        album = self._sp.album(spotify_id)
        track_ids = [t["id"] for t in album["tracks"]["items"]]
        track_numbers = {t["id"]: t["track_number"] for t in album["tracks"]["items"]}

        popularity_map: dict[str, int] = {}
        for track_id in track_ids:
            try:
                t = self._sp.track(track_id)
            except SpotifyException:
                continue
            if t:
                popularity_map[t["id"]] = t["popularity"]

        sorted_tracks = sorted(track_ids, key=lambda tid: popularity_map.get(tid, 0), reverse=True)
        return [track_numbers[tid] for tid in sorted_tracks[:5]]


def get_spotify_client() -> SpotifyClient:
    return SpotifyClient()
