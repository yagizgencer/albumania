import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiClient, setAccessToken } from "../api/client";
import { getUser, type UserProfile } from "../api/users";

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
    setState({ username: null, profile: null, isLoading: false });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!state.username) return;
    await loadProfile(state.username);
  }, [loadProfile, state.username]);

  // On mount, try a silent refresh so users don't have to log in again
  // after closing the tab (as long as the httpOnly refresh cookie is still valid).
  useEffect(() => {
    apiClient
      .post<{ access_token: string }>("/auth/refresh")
      .then(({ data }) => login(data.access_token))
      .catch(() => setState({ username: null, profile: null, isLoading: false }));
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
