import { useState } from "react";
import { Link } from "react-router-dom";
import { changePassword, resendVerification } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/apiError";
import { Alert } from "../components/Alert";
import { PasswordInput } from "../components/PasswordInput";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setSuccess("Password changed. A confirmation email has been sent.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not change password"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    try {
      await resendVerification();
      setResent(true);
    } catch {
      // best-effort; ignore
    }
  }

  return (
    <main className={styles.page}>
      <h1>Settings</h1>

      <section className={styles.section}>
        <h2>Email</h2>
        <p className={styles.email}>{profile?.email}</p>
        {profile && !profile.email_verified ? (
          <Alert
            variant="info"
            action={
              <button type="button" onClick={onResend} disabled={resent}>
                {resent ? "Sent" : "Resend"}
              </button>
            }
          >
            Your email isn't verified yet. Verify it to unlock friends and listen
            invites.
          </Alert>
        ) : (
          <p className={styles.verified}>✓ Verified</p>
        )}
      </section>

      <section className={styles.section}>
        <h2>Change password</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Current password
            <PasswordInput
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <PasswordInput
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <Alert>{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>

      <p>
        <Link to={`/profile/${profile?.username ?? ""}`}>Back to profile</Link>
      </p>
    </main>
  );
}
