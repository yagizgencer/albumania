"""Tests for the in-process TTL cache backing the Spotify lookups."""
import threading
import time

from app.services.cache import TTLCache
from app.services.spotify import _build_session


def test_session_never_sleeps_on_retry_after() -> None:
    """The fix for artist pages hanging forever.

    urllib3 implements Retry-After as an uncapped `time.sleep()` on the calling
    thread, and `requests_timeout` does not bound it. Spotify answers a
    rate-limited app with a Retry-After of minutes or hours, so honouring it
    parks an anyio worker (holding its DB connection) far past any sane request
    lifetime — the browser just spins and nothing ever errors.
    """
    retry = _build_session().get_adapter("https://api.spotify.com").max_retries

    assert retry.respect_retry_after_header is False
    # 429 must surface immediately rather than being retried; core.errors turns
    # it into a 503 the frontend already renders.
    assert 429 not in retry.status_forcelist
    # Transient upstream failures are still worth one or two quick retries.
    assert 500 in retry.status_forcelist
    assert retry.total <= 2
    assert retry.backoff_max <= 2


def test_returns_cached_value_without_calling_loader_again() -> None:
    cache: TTLCache[str] = TTLCache()
    calls = []

    def loader() -> str:
        calls.append(1)
        return "value"

    assert cache.get_or_load("k", 60, loader) == "value"
    assert cache.get_or_load("k", 60, loader) == "value"
    assert len(calls) == 1


def test_expired_entry_is_reloaded() -> None:
    cache: TTLCache[int] = TTLCache()
    calls = []

    def loader() -> int:
        calls.append(1)
        return len(calls)

    assert cache.get_or_load("k", 0.05, loader) == 1
    time.sleep(0.06)
    assert cache.get_or_load("k", 0.05, loader) == 2
    assert len(calls) == 2


def test_concurrent_callers_load_once() -> None:
    """The single-flight guarantee.

    Without this, ten people opening the same artist page fire ten full Spotify
    paginations. The loader blocks briefly so every thread is genuinely inside
    get_or_load at the same time.
    """
    cache: TTLCache[str] = TTLCache()
    calls: list[int] = []
    start = threading.Barrier(8)

    def loader() -> str:
        calls.append(1)
        time.sleep(0.1)
        return "value"

    def worker(results: list[str], i: int) -> None:
        start.wait()
        results[i] = cache.get_or_load("shared", 60, loader)

    results = [""] * 8
    threads = [threading.Thread(target=worker, args=(results, i)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert results == ["value"] * 8
    assert len(calls) == 1


def test_different_keys_do_not_block_each_other() -> None:
    cache: TTLCache[str] = TTLCache()
    assert cache.get_or_load("a", 60, lambda: "first") == "first"
    assert cache.get_or_load("b", 60, lambda: "second") == "second"
    assert cache.get("a") == "first"
    assert cache.get("b") == "second"


def test_evicts_oldest_beyond_max_entries() -> None:
    cache: TTLCache[int] = TTLCache(max_entries=3)
    for i in range(5):
        cache.set(f"k{i}", i, 60)
    # First two insertions are gone; the last three survive.
    assert cache.get("k0") is None
    assert cache.get("k1") is None
    assert cache.get("k4") == 4


def test_clear_drops_everything() -> None:
    cache: TTLCache[str] = TTLCache()
    cache.set("k", "v", 60)
    cache.clear()
    assert cache.get("k") is None


def test_breaker_short_circuits_after_rate_limit() -> None:
    """A 429 must stop us calling Spotify at all for a cooldown.

    Otherwise a throttled app never recovers: every page view earns another 429,
    which keeps the quota pinned, and failed calls aren't cached so refreshing
    hammers hardest exactly when we can least afford it.
    """
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import (
        _TRIP_AFTER_CONSECUTIVE_429S,
        SpotifyClient,
        _breaker,
    )

    _breaker.reset()
    client = SpotifyClient.__new__(SpotifyClient)  # skip real credentials
    calls = []

    def rate_limited():
        calls.append(1)
        raise SpotifyException(429, -1, "rate limited", headers={"Retry-After": "30"})

    # Tripping on a single 429 was too blunt — Spotify throttles shared cloud IPs
    # intermittently, so one unlucky call would take search and everything else
    # offline for the whole cooldown. It takes repeated failures to open.
    for _ in range(_TRIP_AFTER_CONSECUTIVE_429S):
        try:
            client._call(rate_limited)
        except SpotifyException as exc:
            assert exc.http_status == 429
    assert len(calls) == _TRIP_AFTER_CONSECUTIVE_429S

    # Now open: further calls fail locally without spending any quota.
    for _ in range(5):
        try:
            client._call(rate_limited)
        except SpotifyException as exc:
            assert exc.http_status == 429
    assert len(calls) == _TRIP_AFTER_CONSECUTIVE_429S, "breaker should have stopped calls"

    _breaker.reset()
    client._call(lambda: "ok")  # recovers once the cooldown clears


def test_retry_after_is_clamped() -> None:
    """Honour Spotify's Retry-After, but never let it mute the feature for hours."""
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import _COOLDOWN_DEFAULT, _COOLDOWN_MAX, _retry_after_seconds

    assert _retry_after_seconds(SpotifyException(429, -1, "x", headers={"Retry-After": "30"})) == 30
    # Spotify really does send these: an observed penalty was 58192s (16 hours),
    # and its guidance says calling during the window earns a fresh lockout — so
    # honour it in full rather than probing early.
    assert (
        _retry_after_seconds(SpotifyException(429, -1, "x", headers={"Retry-After": "58192"}))
        == 58192
    )
    assert (
        _retry_after_seconds(SpotifyException(429, -1, "x", headers={"Retry-After": "999999"}))
        == _COOLDOWN_MAX
    )
    # A missing or junk header still earns a real pause.
    assert _retry_after_seconds(SpotifyException(429, -1, "x")) == _COOLDOWN_DEFAULT


def test_a_success_resets_the_failure_streak() -> None:
    """Intermittent 429s must not accumulate into an outage.

    A shared cloud IP sees occasional throttling; only a sustained run of them
    means we are genuinely rate limited.
    """
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import SpotifyClient, _breaker

    _breaker.reset()
    client = SpotifyClient.__new__(SpotifyClient)

    def rate_limited():
        raise SpotifyException(429, -1, "rate limited")

    for _ in range(10):
        try:
            client._call(rate_limited)
        except SpotifyException:
            pass
        client._call(lambda: "ok")  # a success in between
        assert not _breaker.is_open(), "alternating failures should never trip it"

    _breaker.reset()


def test_cooldown_survives_a_restart(client) -> None:
    """The penalty must outlive the process that earned it.

    Spotify's guidance is explicit that calling during a penalty window earns a
    fresh, longer lockout. Observed windows are 12-24 hours, while a Render
    deploy or restart happens far more often than that — so an in-memory-only
    breaker would resume calling mid-penalty every time we shipped.
    """
    from datetime import datetime, timedelta, timezone

    from app.services.spotify import _breaker

    _breaker.reset()
    _breaker.record_rate_limit(58192)  # the real observed value: ~16 hours
    _breaker.record_rate_limit(58192)
    _breaker.record_rate_limit(58192)
    assert _breaker.is_open()

    # Simulate a restart: wipe in-memory state, forcing a reload from the DB.
    _breaker._open_until = None
    _breaker._loaded = False
    _breaker._consecutive_429s = 0

    assert _breaker.is_open(), "a restart must not resume calling mid-penalty"
    assert _breaker._open_until > datetime.now(timezone.utc) + timedelta(hours=15)

    _breaker.reset()


def test_spacer_throttles_locally_without_blaming_spotify(client) -> None:
    """Our own throttling must not count as Spotify rate-limiting us."""
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import SpotifyClient, _breaker, _spacer

    _breaker.reset()
    _spacer.interval = 10.0  # force the queue to overflow immediately
    try:
        c = SpotifyClient.__new__(SpotifyClient)
        c._call(lambda: "first")  # reserves the slot
        for _ in range(5):
            try:
                c._call(lambda: "should not run")
            except SpotifyException as exc:
                assert exc.http_status == 429
        # Local backpressure is not evidence of a Spotify penalty.
        assert not _breaker.is_open()
    finally:
        _spacer.interval = 0
        _spacer.reset()
        _breaker.reset()


def test_long_retry_after_trips_immediately(client) -> None:
    """A penalty-sized Retry-After must stop us on the first 429.

    Waiting for a third strike spends exactly the calls that deepen the hole,
    and an alternating fail/succeed pattern would reset the streak and never
    trip at all. Observed penalties were 58192s and 1747s.
    """
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import SpotifyClient, _breaker

    _breaker.reset()
    c = SpotifyClient.__new__(SpotifyClient)
    calls = []

    def penalised():
        calls.append(1)
        raise SpotifyException(429, -1, "penalty", headers={"Retry-After": "1747"})

    try:
        c._call(penalised)
    except SpotifyException:
        pass
    assert _breaker.is_open(), "a penalty-sized Retry-After must trip on the first 429"

    # And nothing further reaches Spotify.
    for _ in range(3):
        try:
            c._call(penalised)
        except SpotifyException:
            pass
    assert len(calls) == 1
    _breaker.reset()


def test_short_retry_after_still_needs_repeats(client) -> None:
    """Ordinary throttling shouldn't take the whole feature offline."""
    from spotipy.exceptions import SpotifyException

    from app.services.spotify import SpotifyClient, _breaker

    _breaker.reset()
    c = SpotifyClient.__new__(SpotifyClient)

    def throttled():
        raise SpotifyException(429, -1, "slow down", headers={"Retry-After": "2"})

    try:
        c._call(throttled)
    except SpotifyException:
        pass
    assert not _breaker.is_open()
    _breaker.reset()
