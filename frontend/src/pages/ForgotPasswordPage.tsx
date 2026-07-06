import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      // The endpoint always succeeds for privacy; ignore transport errors so we
      // still show the same neutral confirmation.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  return (
    <AuthLayout title="Forgot password">
      {sent ? (
        <>
          <Alert variant="success">
            If that email is registered, we’ve sent a link to reset your password.
            Check your inbox (and spam folder).
          </Alert>
          <p>
            <Link to="/login">Back to log in</Link>
          </p>
        </>
      ) : (
        <>
          <p>Enter your email and we’ll send you a reset link.</p>
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <Button type="submit" block disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <p>
            <Link to="/login">Back to log in</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
