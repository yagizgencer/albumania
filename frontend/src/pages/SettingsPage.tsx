import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { changePassword, resendVerification } from "../api/auth";
import { updateMe, type ProfileVisibility, type UserProfile } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../lib/apiError";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { PasswordInput } from "../components/PasswordInput";
import styles from "./SettingsPage.module.css";

type TabId = "account" | "security" | "privacy";

const TABS: { id: TabId; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
];

export function SettingsPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : "account";

  function selectTab(id: TabId) {
    setParams(id === "account" ? {} : { tab: id }, { replace: true });
  }

  if (!profile) {
    return <main className={styles.page}><LoadingState /></main>;
  }

  return (
    <main className={styles.page}>
      <h1>Settings</h1>

      <div className={styles.layout}>
        <nav className={styles.tabs} role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.panel}>
          {tab === "account" && <AccountTab profile={profile} />}
          {tab === "security" && <SecurityTab />}
          {tab === "privacy" && <PrivacyTab profile={profile} />}
        </div>
      </div>

      <p className={styles.backLink}>
        <Link to={`/profile/${profile.username}`}>Back to profile</Link>
      </p>
    </main>
  );
}

function AccountTab({ profile }: { profile: UserProfile }) {
  const [resent, setResent] = useState(false);

  async function onResend() {
    try {
      await resendVerification();
      setResent(true);
    } catch {
      // best-effort; ignore
    }
  }

  return (
    <section className={styles.section}>
      <h2>Email</h2>
      <p className={styles.email}>{profile.email}</p>
      {!profile.email_verified ? (
        <Alert
          variant="info"
          action={
            <button type="button" onClick={onResend} disabled={resent}>
              {resent ? "Sent" : "Resend"}
            </button>
          }
        >
          Your email isn't verified yet. Verify it to unlock friends and listen invites.
        </Alert>
      ) : (
        <p className={styles.verified}>✓ Verified</p>
      )}
    </section>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <section className={styles.section}>
      <h2>Change password</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Current password
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" required />
        </label>
        <label>
          New password
          <PasswordInput value={next} onChange={setNext} autoComplete="new-password" required />
        </label>
        <label>
          Confirm new password
          <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" required />
        </label>
        {error && <Alert>{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function PrivacyTab({ profile }: { profile: UserProfile }) {
  const { refreshProfile } = useAuth();
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile.profile_visibility);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateMe({ profile_visibility: visibility });
      await refreshProfile();
      setSuccess("Privacy settings saved.");
    } catch {
      setError("Could not update privacy settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.section}>
      <h2>Profile visibility</h2>
      <form onSubmit={handleSave}>
        <label>
          Who can see your dashboard
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ProfileVisibility)}
          >
            <option value="public">Public — anyone can see your dashboard</option>
            <option value="friends">Friends only — only your friends can see it</option>
            <option value="private">Private — only you can see it</option>
          </select>
        </label>
        {error && <Alert>{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}
