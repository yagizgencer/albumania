import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { changePassword, resendVerification } from "../api/auth";
import { updateMe, type ProfileVisibility, type UserProfile } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ThemePreference } from "../context/ThemeContext";
import { getErrorMessage } from "../lib/apiError";
import { profilePath } from "../lib/paths";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { LoadingState } from "../components/Spinner";
import { PageContainer } from "../components/PageContainer";
import { PasswordInput } from "../components/PasswordInput";
import { Select } from "../components/Select";
import { Tabs } from "../components/Tabs";
import styles from "./SettingsPage.module.css";

type TabId = "account" | "appearance" | "security" | "privacy";

const TABS: { id: TabId; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
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
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <h1 className={styles.pageTitle}>Settings</h1>

      <div className={styles.layout}>
        <nav className={styles.rail} aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              className={`${styles.railItem} ${tab === t.id ? styles.railItemActive : ""}`}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.content}>
          {tab === "account" && <AccountTab profile={profile} />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "privacy" && <PrivacyTab profile={profile} />}

          <p className={styles.backLink}>
            <Link to={profilePath(profile.username)}>← Back to profile</Link>
          </p>
        </div>
      </div>
    </PageContainer>
  );
}

/** Reusable settings panel — a titled card so the content fills the width nicely. */
function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {description && <p className={styles.panelDesc}>{description}</p>}
      </div>
      {children}
    </section>
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
    <Panel title="Email" description="The address you use to sign in.">
      <p className={styles.email}>{profile.email}</p>
      {!profile.email_verified ? (
        <Alert
          variant="info"
          action={
            <Button intent="secondary" size="sm" onClick={onResend} disabled={resent}>
              {resent ? "Sent" : "Resend"}
            </Button>
          }
        >
          Your email isn't verified yet. Verify it to unlock friends and listen invites.
        </Alert>
      ) : (
        <p className={styles.verified}>✓ Verified</p>
      )}
    </Panel>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceTab() {
  const { preference, setPreference } = useTheme();
  return (
    <Panel
      title="Theme"
      description="Choose a light or dark look, or follow your device's setting."
    >
      <div className={styles.themeRow}>
        <Tabs
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          ariaLabel="Theme preference"
        />
        <span className={styles.themeHint}>
          {preference === "system"
            ? "Following your device's light/dark setting."
            : `Always ${preference}.`}
        </span>
      </div>
    </Panel>
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
    <Panel title="Change password" description="Use at least 8 characters.">
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
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Panel>
  );
}

const VISIBILITY_OPTIONS: { value: ProfileVisibility; label: string }[] = [
  { value: "public", label: "Public — anyone can see your dashboard" },
  { value: "friends", label: "Friends only — only your friends can see it" },
];

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
    <Panel title="Profile visibility" description="Control who can see your dashboard.">
      <form onSubmit={handleSave}>
        <label>
          Who can see your dashboard
          <Select
            value={visibility}
            options={VISIBILITY_OPTIONS}
            onChange={setVisibility}
            ariaLabel="Who can see your dashboard"
            block
          />
        </label>
        {error && <Alert>{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </Panel>
  );
}
