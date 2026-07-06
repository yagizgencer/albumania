import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { Alert } from "../components/Alert";
import { AuthLayout } from "../components/AuthLayout";
import { LoadingState } from "../components/Spinner";

type Status = "verifying" | "success" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const ran = useRef(false);

  useEffect(() => {
    // Guard against React 18 StrictMode double-invoke.
    if (ran.current) return;
    ran.current = true;

    const token = params.get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    verifyEmail(token)
      .then(async () => {
        setStatus("success");
        await refreshProfile();
      })
      .catch(() => setStatus("error"));
  }, [params, refreshProfile]);

  return (
    <AuthLayout title="Verify email">
      {status === "verifying" && <LoadingState label="Verifying your email…" />}
      {status === "success" && (
        <>
          <Alert variant="success">Your email is verified. Thanks!</Alert>
          <p><Link to="/">Go to home</Link></p>
        </>
      )}
      {status === "error" && (
        <>
          <Alert>This verification link is invalid or has expired.</Alert>
          <p><Link to="/">Go to home</Link> and resend it from Settings.</p>
        </>
      )}
    </AuthLayout>
  );
}
