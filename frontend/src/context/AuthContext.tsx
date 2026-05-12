import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiClient, setAccessToken } from "../api/client";

interface AuthState {
  userId: number | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string) => void;
  logout: () => Promise<void>;
}

function parseUserId(token: string): number {
  const payload = JSON.parse(atob(token.split(".")[1]));
  return Number(payload.sub);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, isLoading: true });

  const login = useCallback((token: string) => {
    setAccessToken(token);
    setState({ userId: parseUserId(token), isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // ignore — cookie is cleared server-side on best-effort basis
    }
    setAccessToken(null);
    setState({ userId: null, isLoading: false });
  }, []);

  // On mount, try a silent refresh so users don't have to log in again
  // after closing the tab (as long as the httpOnly refresh cookie is still valid).
  useEffect(() => {
    apiClient
      .post<{ access_token: string }>("/auth/refresh")
      .then(({ data }) => login(data.access_token))
      .catch(() => setState({ userId: null, isLoading: false }));
  }, [login]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
