import { useEffect, useRef, useState } from "react";

/**
 * Like useState, but persisted to sessionStorage under `key`. Survives a
 * component remount within the same tab session — used so dashboard UI state
 * (sort, metric, filters, selected friend) isn't lost when the user opens an
 * album and navigates back. Re-reads when `key` changes (e.g. switching to a
 * different profile or friend), falling back to `initial` if nothing is stored.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => read(key, initial));
  const keyRef = useRef(key);

  // When the key changes, load that key's stored value (or the default).
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setState(read(key, initial));
    }
    // `initial` is intentionally excluded — only the key drives a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage full / unavailable — non-fatal, just don't persist
    }
  }, [key, state]);

  return [state, setState] as const;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
