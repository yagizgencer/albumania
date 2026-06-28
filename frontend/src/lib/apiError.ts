import { AxiosError } from "axios";

/**
 * Pull a human-readable message out of an unknown thrown value. Prefers the
 * FastAPI `{ detail: ... }` payload, falls back to the axios message, then to
 * the caller-provided default — so the UI never has to render a raw error
 * object or an empty string.
 */
export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof AxiosError) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    // Pydantic validation errors arrive as a list of {msg, loc, ...}.
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
