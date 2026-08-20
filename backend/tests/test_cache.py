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
