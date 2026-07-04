// Client-side mirrors of the backend signup rules (see backend
// app/schemas/user.py). These drive live hints only — the backend is the real
// gate, so bypassing the UI still gets rejected server-side.

const USERNAME_RE = /^[a-zA-Z0-9._]{5,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Returns an error message for an in-progress username, or null when valid. */
export function usernameError(value: string): string | null {
  if (value.length === 0) return null; // don't nag before they type
  if (value.length < 5) return "A bit short — use at least 5 characters.";
  if (value.length > 20) return "A bit long — keep it under 20 characters.";
  if (!USERNAME_RE.test(value)) {
    return "Use only letters, numbers, dots, and underscores.";
  }
  return null;
}

/** Returns an error message for an in-progress email, or null when valid. */
export function emailError(value: string): string | null {
  if (value.length === 0) return null;
  if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address.";
  return null;
}
