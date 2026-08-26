import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  apiClient,
  refreshAccessToken,
  setAccessToken,
  setOnAuthFailure,
} from "../api/client";
import { getUser, type UserProfile } from "../api/users";

// A hint that this browser has logged in before. The refresh token itself is an
// httpOnly cookie we can't read, so without this marker every anonymous visitor
// blocks the whole SPA on a boot-time /auth/refresh that is guaranteed to 401.
const SESSION_HINT_KEY = "albumania.hasSession";

function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    // Safari private mode and similar — fall back to attempting the refresh.
    return true;
  }
}

function setSessionHint(value: boolean): void {
  try {
    if (value) localStorage.setItem(SESSION_HINT_KEY, "1");
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Non-fatal: we just lose the optimisation.
  }
}

interface AuthState {
  username: string | null;
  profile: UserProfile | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

function parseUsername(token: string): string {
  const payload = JSON.parse(atob(token.split(".")[1]));
  return payload.sub as string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    username: null,
    profile: null,
    isLoading: true,
  });

  const loadProfile = useCallback(async (username: string) => {
    try {
      const profile = await getUser(username);
      setState((prev) =>
        prev.username === username ? { ...prev, profile } : prev
      );
    } catch {
      // ignore — NavBar will fall back to the gradient initial
    }
  }, []);

  const login = useCallback(
    (token: string) => {
      setAccessToken(token);
      setSessionHint(true);
      const username = parseUsername(token);
      setState({ username, profile: null, isLoading: false });
      void loadProfile(username);
    },
    [loadProfile]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // ignore — cookie is cleared server-side on best-effort basis
    }
    setAccessToken(null);
    setSessionHint(false);
    setState({ username: null, profile: null, isLoading: false });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.username) return;
    await loadProfile(state.username);
  }, [loadProfile, state.username]);

  // A failed silent refresh anywhere in the app means we can't serve authed pages —
  // clear the state here so ProtectedRoute stops rendering pages that can only 401.
  //
  // Only drop the session hint on a real 401 though. Clearing it on any failure
  // (a timeout, an offline blip, a cold-start stall) is unrecoverable: the mount
  // effect below then skips the refresh entirely on every future page load, so one
  // bad network moment permanently logs out a user whose cookie is still valid.
  useEffect(() => {
    setOnAuthFailure((sessionExpired) => {
      if (sessionExpired) setSessionHint(false);
      setState({ username: null, profile: null, isLoading: false });
    });
    return () => setOnAuthFailure(null);
  }, []);

  // On mount, try a silent refresh so users don't have to log in again
  // after closing the tab (as long as the httpOnly refresh cookie is still valid).
  // Skipped entirely for browsers that have never logged in — otherwise every
  // visitor to the public landing page waits on a round-trip that must fail.
  useEffect(() => {
    if (!hasSessionHint()) {
      setState({ username: null, profile: null, isLoading: false });
      return;
    }
    refreshAccessToken()
      .then((token) => login(token))
      .catch(() => {
        // The session hint is handled by onAuthFailure above, which knows whether
        // this was a real 401. Registering that effect first guarantees it ran.
        setState({ username: null, profile: null, isLoading: false });
      });
  }, [login]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
