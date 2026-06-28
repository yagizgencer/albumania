import { useState } from "react";
import { resendVerification } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { Alert } from "./Alert";

/** Shown under the nav for logged-in users who haven't verified their email. */
export function VerifyBanner() {
  const { username, profile } = useAuth();
  const [resent, setResent] = useState(false);

  if (!username || !profile || profile.email_verified) return null;

  async function onResend() {
    try {
      await resendVerification();
      setResent(true);
    } catch {
      // best-effort
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0.5rem auto 0", padding: "0 1.5rem" }}>
      <Alert
        variant="info"
        action={
          <button type="button" onClick={onResend} disabled={resent}>
            {resent ? "Email sent" : "Resend email"}
          </button>
        }
      >
        Verify your email to unlock friends and listen invites.
      </Alert>
    </div>
  );
}
