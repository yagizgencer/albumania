import { useState } from "react";
import { resendVerification } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { Button } from "./Button";
import { InboxIcon } from "./Icons";
import styles from "./VerifyBanner.module.css";

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
      <div className={`${styles.card} ${styles.amberBorder}`}>
        <span className={styles.iconBadge}>
          <InboxIcon size={22} />
        </span>
        <span className={styles.body}>
          <span className={styles.message}>
            <strong>Verify your email</strong> to unlock friends and listen invites.
            If you don't see it, please check your spam folder.
          </span>
          <span className={styles.action}>
            <Button
              intent="secondary"
              size="sm"
              className={styles.btnAmberFill}
              onClick={onResend}
              disabled={resent}
            >
              {resent ? "Email sent" : "Resend email"}
            </Button>
          </span>
        </span>
      </div>
    </div>
  );
}
