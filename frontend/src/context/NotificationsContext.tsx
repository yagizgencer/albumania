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
  refresh: () => Promise<void>;
  markSeen: (scope: NotificationScope) => Promise<void>;
}

const ZERO: NotificationSummary = { bell: 0, listen_invites: 0, friend_requests: 0 };

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_INTERVAL_MS = 30_000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { username } = useAuth();
  const [summary, setSummary] = useState<NotificationSummary>(ZERO);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!username) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setSummary(await getNotificationSummary());
    } catch {
      // Network blip — keep the old summary; the next poll will retry.
    } finally {
      inFlightRef.current = false;
    }
  }, [username]);

  const markSeen = useCallback(
    async (scope: NotificationScope) => {
      if (!username) return;
      // Optimistic update so the badge clears instantly.
      setSummary((prev) => {
        if (scope === "bell") return { bell: 0, listen_invites: 0, friend_requests: 0 };
        if (scope === "listen_invites") {
          return { ...prev, listen_invites: 0, bell: Math.max(0, prev.bell - prev.listen_invites) };
        }
        return { ...prev, friend_requests: 0, bell: Math.max(0, prev.bell - prev.friend_requests) };
      });
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
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [username, refresh]);

  return (
    <NotificationsContext.Provider value={{ summary, refresh, markSeen }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
