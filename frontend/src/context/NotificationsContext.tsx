import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getNotificationSummary,
  markSeen as apiMarkSeen,
  type NotificationScope,
  type NotificationSummary,
} from "../api/notifications";
import { useAuth } from "./AuthContext";

interface NotificationsContextValue {
  summary: NotificationSummary;
  /** Bumps when the poll observes a NEW notification arriving. Pages that show
   *  notification-derived data (friend requests, invites) subscribe to this to
   *  refetch themselves — without it a page only ever loads on mount, so a
   *  request that arrives while you're looking at /friends never shows up. */
  version: number;
  refresh: () => Promise<void>;
  markSeen: (scope: NotificationScope) => Promise<void>;
}

const ZERO: NotificationSummary = { bell: 0, listen_invites: 0, friend_requests: 0 };

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// Only while the tab is actually visible — the `visibilityState` guard below is
// what stops tabs left in the background overnight from hitting the API forever,
// so the interval itself can afford to be short. /notifications/summary is a
// single indexed GROUP BY, and a visible tab at 25s is ~2.4 requests a minute.
const POLL_INTERVAL_MS = 25_000;

function sameCounts(a: NotificationSummary, b: NotificationSummary): boolean {
  return (
    a.bell === b.bell &&
    a.listen_invites === b.listen_invites &&
    a.friend_requests === b.friend_requests
  );
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  const [summary, setSummary] = useState<NotificationSummary>(ZERO);
  const [version, setVersion] = useState(0);
  const inFlightRef = useRef(false);
  // Compared against outside the setSummary updater on purpose: StrictMode
  // double-invokes updaters, which would double-bump `version`.
  const lastRef = useRef<NotificationSummary>(ZERO);

  const refresh = useCallback(async () => {
    if (!username) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await getNotificationSummary();
      const prev = lastRef.current;
      lastRef.current = next;
      // Only an INCREASE means something new arrived. Decreases come from the
      // user's own actions (mark-seen, accept, decline), and bumping on those
      // would make every subscriber refetch in response to itself.
      if (next.bell > prev.bell) setVersion((v) => v + 1);
      // Keep the old object when nothing changed so consumers don't re-render
      // on every idle poll.
      setSummary((current) => (sameCounts(current, next) ? current : next));
    } catch {
      // Network blip — keep the old summary; the next poll will retry.
    } finally {
      inFlightRef.current = false;
    }
  }, [username]);

  const markSeen = useCallback(
    async (scope: NotificationScope) => {
      if (!username) return;
      // Optimistic update so the badge clears instantly. Keep lastRef in step,
      // or the next poll compares against a stale (higher) count and misses a
      // notification that arrives between the mark-seen and that poll.
      const prev = lastRef.current;
      const next: NotificationSummary =
        scope === "bell"
          ? ZERO
          : scope === "listen_invites"
            ? { ...prev, listen_invites: 0, bell: Math.max(0, prev.bell - prev.listen_invites) }
            : { ...prev, friend_requests: 0, bell: Math.max(0, prev.bell - prev.friend_requests) };
      lastRef.current = next;
      setSummary(next);
      try {
        await apiMarkSeen(scope);
      } catch {
        // Re-sync on failure.
        await refresh();
      }
    },
    [username, refresh]
  );

  useEffect(() => {
    if (!username) {
      setSummary(ZERO);
      lastRef.current = ZERO;
      return;
    }
    void refresh();
    const id = window.setInterval(() => {
      // A hidden tab's badge is invisible, so polling it is pure server load.
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, POLL_INTERVAL_MS);

    // Coming back to the tab is exactly when a stale badge is worth correcting,
    // so catch up immediately rather than waiting out the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [username, refresh]);

  return (
    <NotificationsContext.Provider value={{ summary, version, refresh, markSeen }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
