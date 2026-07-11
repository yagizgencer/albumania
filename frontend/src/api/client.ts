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

// On 401, attempt one silent refresh using the httpOnly cookie, then retry.
// Skip auth/login and auth/refresh themselves — retrying those would loop forever.
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const { data } = await apiClient.post<{ access_token: string }>(
          "/auth/refresh"
        );
        setAccessToken(data.access_token);
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return apiClient(original);
      } catch {
        setAccessToken(null);
      }
    }
    return Promise.reject(error);
  }
);
