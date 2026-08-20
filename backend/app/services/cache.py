"""A small in-process TTL cache with single-flight.

Why not Redis: production runs exactly one uvicorn process, so a process-local
dict is already coherent, and Postgres holds the durable copy of everything that
matters. Adding Redis would mean a new service, a new dependency and a network
hop per lookup to solve a problem we don't have yet. (Revisit if a second
instance is ever added — at that point the cache stops being coherent.)

The single-flight part is the point. Without it, ten people opening the same
artist page at once fire ten identical Spotify paginations; with it, nine of them
wait on the first and reuse its result.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Callable, Generic, Hashable, TypeVar

T = TypeVar("T")


class TTLCache(Generic[T]):
    def __init__(self, max_entries: int = 1024) -> None:
        self._max_entries = max_entries
        # Ordered so eviction can drop the oldest insertion cheaply.
        self._entries: OrderedDict[Hashable, tuple[float, T]] = OrderedDict()
        # Guards `_entries` only — never held while a loader runs.
        self._lock = threading.Lock()
        # One lock per in-flight key, so concurrent callers asking for the *same*
        # key queue up while callers asking for different keys don't block.
        self._key_locks: dict[Hashable, threading.Lock] = {}

    def get(self, key: Hashable) -> T | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.monotonic():
                del self._entries[key]
                return None
            return value

    def set(self, key: Hashable, value: T, ttl: float) -> None:
        with self._lock:
            self._entries[key] = (time.monotonic() + ttl, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def get_or_load(self, key: Hashable, ttl: float, loader: Callable[[], T]) -> T:
        """Return the cached value, or call `loader` to produce one.

        Concurrent callers for the same key run `loader` once; the rest block on
        the key's lock and then read the value the winner stored.
        """
        cached = self.get(key)
        if cached is not None:
            return cached

        with self._lock:
            key_lock = self._key_locks.setdefault(key, threading.Lock())

        with key_lock:
            # The thread that held this lock before us may have just populated
            # the entry — check again before doing the expensive work.
            cached = self.get(key)
            if cached is not None:
                return cached
            value = loader()
            self.set(key, value, ttl)

        with self._lock:
            # Only drop the lock if nobody else picked it up meanwhile; a stale
            # extra lock object is harmless, an unbounded dict of them is not.
            if not key_lock.locked():
                self._key_locks.pop(key, None)
        return value

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self._key_locks.clear()
