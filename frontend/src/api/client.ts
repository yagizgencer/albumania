import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// A production build that forgets to set VITE_API_BASE_URL would silently point
// every request at localhost. Warn loudly (but don't crash the app) so the
// misconfiguration is obvious in the browser console instead of manifesting as
// mysterious network failures.
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  console.error(
    "VITE_API_BASE_URL is not set — the app is falling back to http://localhost:8000. " +
      "Set it in the Vercel project settings.",
  );
}

export const apiClient = axios.create({
  baseURL,
  // axios defaults to no timeout, so a request the server never answers leaves
  // the UI on a spinner forever with no way out. That actually happened: a
  // Spotify 429 parked a server thread on an uncapped Retry-After sleep and
  // artist pages simply never finished loading. The server side is fixed, but
  // the client should never be able to hang regardless of what the server does.
  timeout: 30_000,
  withCredentials: true, // sends the httpOnly refresh cookie
  // Serialize array params as repeated keys (`types=a&types=b`) rather than the
  // default `types[]=a` — that's the shape FastAPI's `list[...]` params expect.
  paramsSerializer: { indexes: null },
});

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// Attach the access token to every request.
apiClient.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Called when a silent refresh fails, so AuthContext can clear the session.
// Without this the app keeps rendering as logged-in against a dead session:
// ProtectedRoute still lets pages mount, every request 401s, and the notification
// poller retries a doomed refresh every minute forever.
//
// `sessionExpired` distinguishes "the refresh cookie is gone or invalid" (a real
// 401) from "the request never got an answer" (timeout, offline, CORS). Only the
// former means the session is actually over; see AuthContext's session hint.
let onAuthFailure: ((sessionExpired: boolean) => void) | null = null;

export function setOnAuthFailure(
  handler: ((sessionExpired: boolean) => void) | null
): void {
  onAuthFailure = handler;
}

// Single-flight guard. A page that fires several requests at once (the album page
// fires six) would otherwise get N parallel 401s and send N parallel refreshes.
// They all currently succeed — refresh tokens are stateless and non-rotating — so
// today it's wasted load; the moment rotation is added it would become random
// logouts. One shared promise, everyone waits on it.
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post<{ access_token: string }>("/auth/refresh")
      .then(({ data }) => {
        setAccessToken(data.access_token);
        return data.access_token;
      })
      .catch((err) => {
        setAccessToken(null);
        onAuthFailure?.(
          axios.isAxiosError(err) && err.response?.status === 401
        );
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// On 401, attempt one silent refresh using the httpOnly cookie, then retry.
// Skip auth/login and auth/refresh themselves — retrying those would loop forever.
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    // An error thrown during request setup has no `config`. Reading `.url` off it
    // would throw a TypeError from inside the interceptor and mask the real error.
    if (!error.config) return Promise.reject(error);

    const original = error.config;
    const isAuthEndpoint = original.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      } catch {
        // refreshAccessToken already cleared the token and notified AuthContext.
      }
    }
    return Promise.reject(error);
  }
);
