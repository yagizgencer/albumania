import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import requests
import spotipy
from requests.adapters import HTTPAdapter
from spotipy.cache_handler import MemoryCacheHandler
from spotipy.exceptions import SpotifyException
from spotipy.oauth2 import SpotifyClientCredentials
from urllib3.util.retry import Retry

from app.core.config import get_settings
from app.services.cache import TTLCache

logger = logging.getLogger("albumania.spotify")

# Socket-level timeout for every Spotify call. Note this does NOT bound retry
# backoff — see _build_session.
_REQUEST_TIMEOUT = 5

# Hard ceiling on discography pagination. Spotify's Feb 2026 Development Mode
# changes capped page size at 10, so a pathological artist could otherwise page
# for a very long time inside a single request. Kept low deliberately: each page
# is a separate call and calls are now spaced a second apart, so this bounds
# both the quota spend and the worst-case latency of a cold artist page.
_MAX_ALBUM_PAGES = 6


class _RateLimitBreaker:
    """Stops calling Spotify for a cooldown once it has rate-limited us.

    Without this, a throttled app never recovers: every artist page view fires
    more calls, each earning another 429, which keeps the quota pinned. Failed
    calls aren't cached either, so a user refreshing the page hammers hardest
    exactly when we can least afford it.

    While the breaker is open we fail immediately and locally — no HTTP at all —
    which `core.errors` turns into the same 503 the caller would have got anyway,
    just without spending quota to earn it.
    """

    def __init__(self) -> None:
        # Wall-clock, not monotonic: this has to be comparable with a value
        # persisted across process restarts.
        self._open_until: datetime | None = None
        self._loaded = False
        self._consecutive_429s = 0
        self._lock = threading.Lock()

    def _load_once(self) -> None:
        """Pick up a cooldown left behind by a previous process.

        Spotify escalates if you call during a penalty window, and a Render
        deploy happens far more often than a 16-hour penalty elapses — so
        without this, every restart would resume calling mid-lockout and earn a
        longer one. Read lazily and cached, so this costs one query per process.
        """
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            try:
                from app.db.session import SessionLocal
                from app.models.spotify_state import SpotifyCooldown

                with SessionLocal() as db:
                    row = db.get(SpotifyCooldown, 1)
                    if row is not None:
                        stored = row.paused_until
                        # SQLite has no timezone type and hands back a naive
                        # datetime where Postgres returns an aware one. Treat
                        # naive as UTC, which is what we wrote.
                        if stored.tzinfo is None:
                            stored = stored.replace(tzinfo=timezone.utc)
                        self._open_until = stored
            except Exception:
                # Never let a cooldown lookup break Spotify entirely; worst case
                # we forget a penalty, which is the old behaviour.
                logger.exception("Could not load Spotify cooldown")
            self._loaded = True

    def _persist(self, until: datetime) -> None:
        try:
            from app.db.session import SessionLocal
            from app.models.spotify_state import SpotifyCooldown

            with SessionLocal() as db:
                row = db.get(SpotifyCooldown, 1)
                if row is None:
                    db.add(SpotifyCooldown(id=1, paused_until=until))
                else:
                    row.paused_until = until
                db.commit()
        except Exception:
            logger.exception("Could not persist Spotify cooldown")

    def is_open(self) -> bool:
        self._load_once()
        return self._open_until is not None and datetime.now(timezone.utc) < self._open_until

    def record_success(self) -> None:
        if self._consecutive_429s:
            with self._lock:
                self._consecutive_429s = 0

    def record_rate_limit(self, seconds: float) -> None:
        """Open the breaker, immediately for a real penalty or after repeats.

        Two different things arrive as a 429. A short Retry-After is ordinary
        throttling — one unlucky call shouldn't take search and every other
        Spotify-backed feature offline, so those need to repeat before we stop.

        A long Retry-After is not ambiguous: Spotify is telling us we are in a
        penalty window, and its guidance is that any traffic during one earns a
        fresh, longer lockout. Observed values were 58192s and later 1747s. Stop
        on the first of those — waiting on strike three means spending exactly
        the calls that deepen the hole, and an alternating fail/succeed pattern
        would reset the streak and never trip at all.
        """
        until = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        with self._lock:
            self._consecutive_429s += 1
            tripped = (
                seconds >= _TRIP_IMMEDIATELY_ABOVE
                or self._consecutive_429s >= _TRIP_AFTER_CONSECUTIVE_429S
            )
            if tripped and (self._open_until is None or until > self._open_until):
                self._open_until = until
            else:
                tripped = False
        if tripped:
            logger.warning(
                "Spotify rate limited; pausing all calls until %s (%.0fs)",
                until.isoformat(),
                seconds,
            )
            self._persist(until)

    def reset(self) -> None:
        with self._lock:
            self._open_until = None
            self._consecutive_429s = 0
            self._loaded = True  # don't re-read the DB and undo the reset


_breaker = _RateLimitBreaker()

# How long to back off after a 429. Spotify's Retry-After is honoured when
# present, clamped into this range so one hostile header can't mute the whole
# feature for hours, and a missing header still gets a real pause.
_COOLDOWN_DEFAULT = 60.0
# Honour Retry-After in full. The breaker only *declines to call* — unlike
# urllib3's Retry-After, which sleeps the calling thread and must never be
# honoured — so waiting a long time here costs nothing but degraded discovery.
# Spotify's guidance is explicit that sending anything during a penalty window
# earns a fresh, longer lockout, so probing early is actively harmful. An
# observed penalty was 58192s (16 hours); 24h is the ceiling on sane values.
_COOLDOWN_MAX = 24 * 60 * 60.0

# If the spacer would make a request wait longer than this, give up and let the
# caller fall back to local data. Under load, degrading to the DB beats
# serialising every user behind a one-per-second queue.
_MAX_THROTTLE_WAIT = 4.0

# A lone 429 with a short Retry-After is ordinary throttling, not evidence of a
# penalty, so tolerate a couple before going quiet.
_TRIP_AFTER_CONSECUTIVE_429S = 3

# ...but an explicit Retry-After above this means Spotify has put us in a penalty
# window, and calling during one earns a fresh, longer lockout. Stop at once.
# Deliberately above _COOLDOWN_DEFAULT, so a 429 carrying no header at all — where
# we're guessing — still needs repeats rather than tripping on one ambiguous call.
_TRIP_IMMEDIATELY_ABOVE = 120.0


class _CallSpacer:
    """Keeps a minimum gap between Spotify calls, process-wide.

    The restricted Development Mode API removed the batch endpoints, so fetching
    twenty trending artists is twenty HTTP calls and a discography is one per
    page. Fired back-to-back those are precisely the "aggressive sub-second
    loops" Spotify penalises. Spacing them costs latency on cold paths only —
    everything hot is served from the cache or the database.
    """

    def __init__(self) -> None:
        self._next_allowed = 0.0
        self._lock = threading.Lock()
        # Instance attribute rather than a constant so it can be tuned by env
        # var in production, and set to 0 in tests (which would otherwise spend
        # a real second per simulated call).
        self.interval = get_settings().spotify_min_call_interval

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait_for = self._next_allowed - now
            if wait_for > _MAX_THROTTLE_WAIT:
                raise SpotifyException(
                    429, -1, "Spotify call throttled locally (queue too long)"
                )
            # Reserve our slot before releasing the lock so concurrent callers
            # queue rather than all sleeping to the same instant.
            self._next_allowed = max(now, self._next_allowed) + self.interval
        if wait_for > 0:
            time.sleep(wait_for)

    def reset(self) -> None:
        """Drop any reserved slot. For tests: a reservation made by one case
        would otherwise reject the next case's call before it reaches Spotify."""
        with self._lock:
            self._next_allowed = 0.0


_spacer = _CallSpacer()

# Set once we discover this Spotify app cannot return track popularity, so we
# stop paying two calls per album to rediscover it. Deliberately process-local
# rather than persisted: it is a property of the credentials, so a restart
# (which is when credentials can change) re-probes.
_popularity_unavailable = False


def _retry_after_seconds(exc: SpotifyException) -> float:
    headers = getattr(exc, "headers", None) or {}
    raw = headers.get("Retry-After") or headers.get("retry-after")
    try:
        return min(max(float(raw), 1.0), _COOLDOWN_MAX)
    except (TypeError, ValueError):
        return _COOLDOWN_DEFAULT


def _build_session() -> requests.Session:
    """A requests session that can never park a thread on Retry-After.

    This is the fix for artist pages hanging forever. urllib3 implements
    Retry-After as a bare, uncapped `time.sleep(retry_after)` on the calling
    thread (`Retry.sleep_for_retry`), and `requests_timeout` does not bound it —
    that only covers connect/read. Spotify answers a rate-limited app with a
    Retry-After measured in minutes or hours, so a single 429 would sleep an
    anyio worker thread (holding its DB connection) far past any sane request
    lifetime. The browser just spins; nothing ever errors.

    So: retry genuinely transient upstream failures with a short exponential
    backoff, but never honour Retry-After, and never retry a 429 at all. A 429
    propagates as a SpotifyException, which `core.errors` turns into a 503 the
    frontend already knows how to display.
    """
    session = requests.Session()
    retry = Retry(
        total=2,
        connect=2,
        read=1,
        status=2,
        backoff_factor=0.3,
        backoff_max=2,
        # Deliberately excludes 429.
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "POST"]),
        respect_retry_after_header=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

# How long each kind of Spotify lookup stays cached in-process. Artist metadata
# and discographies effectively never change; searches are cached mostly so that
# several people typing the same query hit Spotify once.
_ARTIST_TTL = 24 * 60 * 60
_DISCOGRAPHY_TTL = 6 * 60 * 60
_SEARCH_TTL = 24 * 60 * 60

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
            # Defaults to None, i.e. the token POST can hang forever. The token
            # endpoint is rate-limited too, hence the same hardened session.
            requests_timeout=_REQUEST_TIMEOUT,
            requests_session=_build_session(),
        )
        # Passing a Session makes spotipy use it verbatim, so our retry policy
        # applies instead of its default (which honours Retry-After).
        self._sp = spotipy.Spotify(
            auth_manager=auth,
            requests_timeout=_REQUEST_TIMEOUT,
            requests_session=_build_session(),
        )

    def _call(self, fn, *args, **kwargs):
        """Every Spotify request goes through here so the breaker is unavoidable.

        Raises SpotifyException(429) without touching the network while the
        breaker is open, and trips it whenever Spotify hands us a real 429.
        """
        if _breaker.is_open():
            raise SpotifyException(
                429, -1, "Spotify rate limit cooldown in effect (not called)"
            )
        _spacer.wait()
        try:
            result = fn(*args, **kwargs)
        except SpotifyException as exc:
            if exc.http_status == 429:
                _breaker.record_rate_limit(_retry_after_seconds(exc))
            raise
        _breaker.record_success()
        return result

    def search_albums(self, query: str, limit: int = 10) -> list[SpotifyAlbumResult]:
        def load() -> list[SpotifyAlbumResult]:
            data = self._call(self._sp.search, q=query, type="album", limit=limit)
            return [_album_result_from_item(item) for item in data["albums"]["items"]]

        return _cache.get_or_load(("search_albums", query, limit), _SEARCH_TTL, load)

    def search_artists(self, query: str, limit: int = 10) -> list[SpotifyArtist]:
        def load() -> list[SpotifyArtist]:
            data = self._call(self._sp.search, q=query, type="artist", limit=limit)
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
        return _album_result_from_item(self._call(self._sp.album, spotify_id))

    def get_artist(self, artist_id: str) -> SpotifyArtist:
        def load() -> SpotifyArtist:
            item = self._call(self._sp.artist, artist_id)
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
            for page in range(_MAX_ALBUM_PAGES):
                data = self._call(
                    self._sp.artist_albums,
                    artist_id,
                    album_type="album",
                    limit=10,
                    offset=offset,
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
            else:
                # Hit the page cap. Showing a truncated discography beats holding
                # the request (and a DB connection) open indefinitely.
                logger.warning(
                    "artist %s discography truncated at %d pages",
                    artist_id,
                    _MAX_ALBUM_PAGES,
                )
            return results

        return _cache.get_or_load(("artist_albums", artist_id), _DISCOGRAPHY_TTL, load)

    def get_album_tracks(self, spotify_id: str) -> list[SpotifyTrack]:
        # The album object only embeds the first 50 tracks, so page through the
        # dedicated endpoint to get every track for long albums. Page size is 10,
        # not 50 — Spotify's February 2026 Development Mode changes reject
        # limit=50 outright with a 400 "Invalid limit" for newly created apps.
        tracks = []
        offset = 0
        for _page in range(_MAX_ALBUM_PAGES):
            page = self._call(self._sp.album_tracks, spotify_id, limit=10, offset=offset)
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
        else:
            logger.warning(
                "album %s track list truncated at %d pages", spotify_id, _MAX_ALBUM_PAGES
            )
        return tracks

    def get_top5_popular_indices(self, spotify_id: str) -> list[int]:
        """The 5 most-popular track numbers (1-based), or [] if unavailable.

        Returns [] on a Development Mode app. Spotify's restricted track object
        no longer carries `popularity` at all — the field is simply absent from
        /v1/tracks/{id} — so there is nothing to rank by. This used to read
        t["popularity"] directly, and the resulting KeyError surfaced as a 502
        that broke every cold album import.

        One request per track, not batched: the Feb 2026 changes removed the
        batch "Get Several Tracks" endpoint for newly created apps. That makes
        this the most expensive call path in the app, which is why callers
        should not invoke it speculatively — see the albums router.
        """
        global _popularity_unavailable
        if _popularity_unavailable:
            return []

        album = self._call(self._sp.album, spotify_id)
        items = album["tracks"]["items"]
        track_ids = [t["id"] for t in items if t.get("id")]
        track_numbers = {t["id"]: t["track_number"] for t in items if t.get("id")}

        popularity_map: dict[str, int] = {}
        for track_id in track_ids:
            try:
                t = self._call(self._sp.track, track_id)
            except SpotifyException:
                continue
            if not t:
                continue
            popularity = t.get("popularity")
            if popularity is None:
                # Restricted payload: no popularity anywhere, so ranking is
                # meaningless. Bail out rather than spend a call per remaining
                # track to learn the same thing.
                _popularity_unavailable = True
                logger.info(
                    "Spotify track payload has no popularity; top-5 unavailable "
                    "for these credentials (Development Mode restriction). "
                    "Skipping all further top-5 lookups this process."
                )
                return []
            popularity_map[t["id"]] = popularity

        if not popularity_map:
            return []
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
