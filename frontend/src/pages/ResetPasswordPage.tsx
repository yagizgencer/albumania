import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/auth";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { PasswordInput } from "../components/PasswordInput";
import { getErrorMessage } from "../lib/apiError";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthLayout title="Reset password">
        <Alert>This reset link is invalid or incomplete.</Alert>
        <p>
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token as string, password);
      setDone(true);
    } catch (err: unknown) {
      setError(
        getErrorMessage(err, "This reset link is invalid or has expired.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset password">
      {done ? (
        <>
          <Alert variant="success">
            Your password has been reset. You can now log in with your new password.
          </Alert>
          <p>
            <Link to="/login">Go to log in</Link>
          </p>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            New password
            <PasswordInput
              value={password}
              onChange={setPassword}
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
          <Button type="submit" block disabled={submitting}>
            {submitting ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
