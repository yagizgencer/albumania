/**
 * A tiny request cache with in-flight deduplication.
 *
 * There is no data-fetching library here, so every `useEffect` fetch is an
 * unconditional cold round-trip with a full loading spinner — navigating
 * artist → album → back re-fetches the artist from scratch. This covers the
 * cases where that hurts most: album and artist detail, which are the only
 * responses backed by Spotify.
 *
 * Deliberately small. If we ever want this everywhere, the right move is to
 * adopt TanStack Query rather than to grow this file.
 */

interface Entry<T> {
  expiresAt: number;
  value: T;
}

// Short by design: this exists to make back-navigation instant, not to serve
// stale ratings. The backend caches the expensive Spotify parts for hours.
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const entries = new Map<string, Entry<unknown>>();
// Requests that are currently outstanding, so two components mounting at once
// share one HTTP call instead of racing.
const inFlight = new Map<string, Promise<unknown>>();

export function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.value as T);
  }

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((value) => {
      entries.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Drop one entry (exact key) or every entry whose key starts with `prefix`. */
export function invalidate(prefix: string): void {
  for (const key of entries.keys()) {
    if (key === prefix || key.startsWith(prefix)) entries.delete(key);
  }
}

export function clearCache(): void {
  entries.clear();
  inFlight.clear();
}
