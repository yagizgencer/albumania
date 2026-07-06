import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as registerRequest } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/apiError";
import { usernameError, emailError } from "../lib/validation";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { Button } from "../components/Button";
import { PasswordInput } from "../components/PasswordInput";

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live per-field hints (mirror the backend rules) — shown as the user types.
  const usernameHint = usernameError(username);
  const emailHint = emailError(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (usernameError(username) || username.length === 0) {
      setError("Please enter a valid username.");
      return;
    }
    if (emailError(email) || email.length === 0) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await registerRequest({ username, email, displayName, password });
      login(token);
      navigate("/");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create account">
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={usernameHint != null}
            minLength={5}
            maxLength={20}
            required
          />
          {usernameHint && <span className="error">{usernameHint}</span>}
        </label>
        <label>
          Display name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailHint != null}
            required
          />
          {emailHint && <span className="error">{emailHint}</span>}
        </label>
        <label>
          Password
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm password
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" block disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
