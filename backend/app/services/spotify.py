from dataclasses import dataclass
from functools import lru_cache

import spotipy
from spotipy.cache_handler import MemoryCacheHandler
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyClientCredentials

from app.core.config import get_settings
from app.services.cache import TTLCache

# How long each kind of Spotify lookup stays cached in-process. Artist metadata
# and discographies effectively never change; searches are cached mostly so that
# several people typing the same query hit Spotify once.
_ARTIST_TTL = 24 * 60 * 60
_DISCOGRAPHY_TTL = 6 * 60 * 60
_SEARCH_TTL = 60 * 60

_cache = TTLCache(max_entries=2048)


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
            # Default is a CacheFileHandler that re-reads and JSON-parses `.cache`
            # off disk on *every* API call, and is wiped by each Render redeploy.
            # The client is a process-wide singleton now, so memory is the right
            # place for a token that lives an hour.
            cache_handler=MemoryCacheHandler(),
            # Defaults to None, i.e. the token POST can hang forever.
            requests_timeout=5,
        )
        self._sp = spotipy.Spotify(
            auth_manager=auth,
            requests_timeout=5,
            # spotipy defaults to 3 status retries and lets urllib3 honour
            # Spotify's Retry-After, which on a 429 can be tens of seconds. That
            # sleep happens in a threadpool worker holding a DB connection, so
            # keep it to one retry and surface the 429 instead (main.py maps it
            # to a 503 the frontend already handles).
            status_retries=1,
            retries=1,
        )

    def search_albums(self, query: str, limit: int = 10) -> list[SpotifyAlbumResult]:
        def load() -> list[SpotifyAlbumResult]:
            data = self._sp.search(q=query, type="album", limit=limit)
            return [_album_result_from_item(item) for item in data["albums"]["items"]]

        return _cache.get_or_load(("search_albums", query, limit), _SEARCH_TTL, load)

    def search_artists(self, query: str, limit: int = 10) -> list[SpotifyArtist]:
        def load() -> list[SpotifyArtist]:
            data = self._sp.search(q=query, type="artist", limit=limit)
            return [
                SpotifyArtist(
                    spotify_id=item["id"],
                    name=item["name"],
                    image_url=item["images"][0]["url"] if item["images"] else None,
                )
                for item in data["artists"]["items"]
            ]

        return _cache.get_or_load(("search_artists", query, limit), _SEARCH_TTL, load)

    def get_album(self, spotify_id: str) -> SpotifyAlbumResult:
        return _album_result_from_item(self._sp.album(spotify_id))

    def get_artist(self, artist_id: str) -> SpotifyArtist:
        def load() -> SpotifyArtist:
            item = self._sp.artist(artist_id)
            return SpotifyArtist(
                spotify_id=item["id"],
                name=item["name"],
                image_url=item["images"][0]["url"] if item["images"] else None,
            )

        return _cache.get_or_load(("artist", artist_id), _ARTIST_TTL, load)

    def get_artists(self, artist_ids: list[str]) -> dict[str, str | None]:
        """`artist_id -> image_url` lookup. Used to attach photos to trending
        artists. One request per artist, not batched — Spotify's February 2026
        Development Mode changes removed the batch "Get Several Artists"
        endpoint (`GET /artists?ids=...`) for newly created apps; the
        single-item endpoint remains supported, so this fetches one at a time
        instead (see the migration guide's "fetch items individually instead").
        An id that fails on its own (bad id, transient error) is skipped
        rather than failing the whole lookup, matching the batch endpoint's
        original behaviour of silently omitting unresolvable ids.

        Each id goes through `get_artist`, so repeat lookups are served from the
        in-process cache. Callers that need this to be free should read from the
        `artists` table first and only pass ids we've never seen."""
        images: dict[str, str | None] = {}
        for artist_id in artist_ids:
            try:
                artist = self.get_artist(artist_id)
            except SpotifyException:
                continue
            images[artist.spotify_id] = artist.image_url
        return images

    def get_artist_albums(self, artist_id: str) -> list[SpotifyAlbumResult]:
        """Full studio-album discography, de-duped by name (Spotify returns many
        editions: deluxe, remasters, regional variants, etc.). Paginated at 10
        per page — Spotify's February 2026 Development Mode changes reject
        limit=50 outright with a 400 "Invalid limit" for newly created apps,
        so this can no longer fetch everything in one call."""
        def load() -> list[SpotifyAlbumResult]:
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

        return _cache.get_or_load(("artist_albums", artist_id), _DISCOGRAPHY_TTL, load)

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


@lru_cache
def get_spotify_client() -> SpotifyClient:
    """Process-wide singleton.

    This used to build a fresh client per request, which meant a new
    `requests.Session` — and so a full TCP + TLS handshake — on the first Spotify
    call of every request. The lru_cache also keeps a strong reference alive:
    `spotipy.Spotify.__del__` closes the session, so a client that gets garbage
    collected takes its connection pool with it."""
    return SpotifyClient()
