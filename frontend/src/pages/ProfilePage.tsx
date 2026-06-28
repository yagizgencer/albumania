import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  acceptFriendship,
  deleteFriendship,
  listFriendships,
  sendFriendRequest,
  type Friendship,
} from "../api/friendships";
import {
  deleteAvatar,
  getUser,
  updateMe,
  uploadAvatar,
  type ProfileVisibility,
  type UserProfile,
} from "../api/users";
import { usePersistentState } from "../lib/usePersistentState";
import { formatDate } from "../lib/date";
import { Avatar } from "../components/Avatar";
import { ProfileDashboard } from "./ProfileDashboardPage";
import { FriendDashboard } from "./FriendDashboardPage";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import styles from "./ProfilePage.module.css";

type FriendState =
  | { kind: "self" }
  | { kind: "none" }
  | { kind: "pending_sent"; friendship: Friendship }
  | { kind: "pending_received"; friendship: Friendship }
  | { kind: "friends"; friendship: Friendship };

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { username: me, refreshProfile } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // friendshipId we're comparing against, or null = solo dashboard vs Spotify.
  // Persisted per profile so returning from an album re-opens the same view.
  const [compareFriendshipId, setCompareFriendshipId] = usePersistentState<number | null>(
    `dash:compare:${username ?? ""}`,
    null
  );

  const isOwner = !!profile && !!me && profile.username === me;

  async function reloadProfile() {
    if (!username) return;
    try {
      const data = await getUser(username);
      setProfile(data);
    } catch {
      setError("Could not load profile.");
    }
  }

  async function reloadFriendships() {
    try {
      const list = await listFriendships();
      setFriendships([...list.incoming, ...list.outgoing, ...list.accepted]);
    } catch {
      setFriendships([]);
    }
  }

  useEffect(() => {
    setProfile(null);
    setError(null);
    setEditing(false);
    // compareFriendshipId is keyed by username via usePersistentState, so it
    // restores per profile and resets naturally when viewing a different user.
    void reloadProfile();
    void reloadFriendships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const friendState: FriendState | null = useMemo(() => {
    if (!profile || !me || friendships === null) return null;
    if (profile.username === me) return { kind: "self" };
    const match = friendships.find(
      (f) =>
        (f.user_a_username === me && f.user_b_username === profile.username) ||
        (f.user_b_username === me && f.user_a_username === profile.username)
    );
    if (!match) return { kind: "none" };
    if (match.status === "accepted") return { kind: "friends", friendship: match };
    if (match.requested_by === me)
      return { kind: "pending_sent", friendship: match };
    return { kind: "pending_received", friendship: match };
  }, [profile, me, friendships]);

  // Accepted friendships, with the "other" username for each, sorted by name.
  const myFriends = useMemo(() => {
    if (!me || friendships === null) return [];
    return friendships
      .filter((f) => f.status === "accepted")
      .map((f) => ({
        friendshipId: f.id,
        username: f.user_a_username === me ? f.user_b_username : f.user_a_username,
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [friendships, me]);

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (!profile) return <main className={styles.page}><LoadingState /></main>;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setAvatarOpen(true)}
          aria-label="View profile picture"
        >
          <Avatar
            username={profile.username}
            pictureUrl={profile.profile_picture_url}
            displayName={profile.display_name}
            size={88}
            className={styles.avatar}
          />
        </button>
        <div className={styles.headerInfo}>
          {editing && isOwner ? (
            <ProfileEditor
              profile={profile}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setProfile(updated);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <h1 className={styles.displayName}>{profile.display_name}</h1>
              <p className={styles.username}>{profile.username}</p>
              {profile.description ? (
                <p className={styles.description}>{profile.description}</p>
              ) : (
                isOwner && (
                  <p className={styles.descriptionPlaceholder}>
                    No bio yet. Click Edit to add one.
                  </p>
                )
              )}
              <p className={styles.memberSince}>
                Member since {formatDate(profile.created_at)}
              </p>
            </>
          )}
        </div>
        <div className={styles.headerActions}>
          {isOwner && !editing && (
            <button className={styles.editBtn} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {friendState && (
            <FriendshipButton
              state={friendState}
              targetUsername={profile.username}
              onChanged={reloadFriendships}
            />
          )}
        </div>
      </section>

      <section className={styles.dashboardSection}>
        <div className={styles.dashboardHeader}>
          <h2 className={styles.sectionTitle}>Dashboard</h2>
          {isOwner && myFriends.length > 0 && (
            <FriendCombobox
              friends={myFriends}
              selectedId={compareFriendshipId}
              onSelect={(id) => setCompareFriendshipId(id)}
            />
          )}
          {!isOwner && friendState?.kind === "friends" && (
            <button
              className={styles.compareToggleBtn}
              onClick={() =>
                setCompareFriendshipId((prev) =>
                  prev === friendState.friendship.id ? null : friendState.friendship.id
                )
              }
            >
              {compareFriendshipId === friendState.friendship.id
                ? "Hide comparison"
                : "Compare with you"}
            </button>
          )}
        </div>
        {compareFriendshipId !== null ? (
          <FriendDashboard friendshipId={compareFriendshipId} />
        ) : (
          <ProfileDashboard username={profile.username} />
        )}
      </section>

      {avatarOpen && (
        <AvatarLightbox
          profile={profile}
          canEdit={isOwner}
          onClose={() => setAvatarOpen(false)}
          onChanged={(updated) => {
            setProfile(updated);
            if (isOwner) void refreshProfile();
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Avatar lightbox — enlarged view; owner gets Replace + Remove
// ---------------------------------------------------------------------------

function AvatarLightbox({
  profile,
  canEdit,
  onClose,
  onChanged,
}: {
  profile: UserProfile;
  canEdit: boolean;
  onClose: () => void;
  onChanged: (updated: UserProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      onChanged(await uploadAvatar(file));
    } catch (uploadErr: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios error
      setErr((uploadErr as any)?.response?.data?.detail ?? "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setErr(null);
    try {
      await deleteAvatar();
      onChanged({ ...profile, profile_picture_url: null });
    } catch {
      setErr("Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.lightboxBackdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.lightbox} onClick={(e) => e.stopPropagation()}>
        {profile.profile_picture_url ? (
          <img
            src={profile.profile_picture_url}
            alt={`${profile.display_name}'s profile picture`}
            className={styles.lightboxImg}
          />
        ) : (
          <div className={styles.lightboxFallback} aria-hidden>
            {profile.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}

        {err && <Alert>{err}</Alert>}

        <div className={styles.lightboxActions}>
          {canEdit && (
            <>
              <button
                type="button"
                className={styles.lightboxBtnPrimary}
                onClick={() => fileRef.current?.click()}
                disabled={busy}
              >
                {profile.profile_picture_url ? "Replace photo" : "Upload photo"}
              </button>
              {profile.profile_picture_url && (
                <button
                  type="button"
                  className={styles.lightboxBtnDanger}
                  onClick={handleRemove}
                  disabled={busy}
                >
                  Remove photo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleFile}
              />
            </>
          )}
          <button
            type="button"
            className={styles.lightboxBtnGhost}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Friendship button — 4 visible states
// ---------------------------------------------------------------------------

function FriendshipButton({
  state,
  targetUsername,
  onChanged,
}: {
  state: FriendState;
  targetUsername: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "self") return null;

  if (state.kind === "none") {
    return (
      <button
        className={styles.friendBtn}
        onClick={() => run(() => sendFriendRequest(targetUsername))}
        disabled={busy}
        title="Send friend request"
      >
        <span className={styles.friendIcon} aria-hidden>👤</span>
        Add friend
      </button>
    );
  }

  if (state.kind === "pending_sent") {
    return (
      <button
        className={`${styles.friendBtn} ${styles.friendBtnPending}`}
        onClick={() => run(() => deleteFriendship(state.friendship.id))}
        disabled={busy}
        title="Cancel friend request"
      >
        <span className={styles.friendIcon} aria-hidden>⌛</span>
        Request sent
      </button>
    );
  }

  if (state.kind === "pending_received") {
    return (
      <button
        className={`${styles.friendBtn} ${styles.friendBtnAccept}`}
        onClick={() => run(() => acceptFriendship(state.friendship.id))}
        disabled={busy}
        title="Accept friend request"
      >
        <span className={styles.friendIcon} aria-hidden>＋</span>
        Accept request
      </button>
    );
  }

  // friends
  return (
    <button
      className={`${styles.friendBtn} ${styles.friendBtnFriends}`}
      onClick={() => {
        if (!confirm(`Unfriend ${targetUsername}?`)) return;
        void run(() => deleteFriendship(state.friendship.id));
      }}
      disabled={busy}
      title="Unfriend"
    >
      <span className={styles.friendIcon} aria-hidden>✓</span>
      Friends
    </button>
  );
}

// ---------------------------------------------------------------------------
// Editor — owner-only inline form
// ---------------------------------------------------------------------------

function ProfileEditor({
  profile,
  onCancel,
  onSaved,
}: {
  profile: UserProfile;
  onCancel: () => void;
  onSaved: (updated: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [description, setDescription] = useState(profile.description ?? "");
  const [visibility, setVisibility] = useState<ProfileVisibility>(
    profile.profile_visibility
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const updated = await updateMe({
        display_name: displayName.trim(),
        description: description.trim() ? description.trim() : null,
        profile_visibility: visibility,
      });
      onSaved(updated);
    } catch {
      setErr("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editor} onSubmit={handleSave}>
      <label>
        Display name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label>
        Bio
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="A short description that appears on your profile."
        />
      </label>
      <label>
        Visibility
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as ProfileVisibility)}
        >
          <option value="public">Public — anyone can see your dashboard</option>
          <option value="private">Private — only friends can see your dashboard</option>
        </select>
      </label>
      {err && <p className="error">{err}</p>}
      <div className={styles.editorActions}>
        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// FriendCombobox — searchable picker for "Compare with"
// ---------------------------------------------------------------------------

interface FriendOption {
  friendshipId: number;
  username: string;
}

function FriendCombobox({
  friends,
  selectedId,
  onSelect,
}: {
  friends: FriendOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => friends.find((f) => f.friendshipId === selectedId) ?? null,
    [friends, selectedId]
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.username.toLowerCase().includes(q));
  }, [friends, query]);

  function choose(id: number | null) {
    onSelect(id);
    setOpen(false);
    setQuery("");
  }

  const displayValue = open ? query : selected?.username ?? "";

  return (
    <div className={styles.compareControl} ref={wrapRef}>
      <span className={styles.compareLabel}>Compare with</span>
      <div className={styles.combobox}>
        <input
          className={styles.compareSelect}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="friend-combobox-list"
          placeholder={selected ? selected.username : "Just Spotify"}
          value={displayValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {selected && (
          <button
            type="button"
            className={styles.comboClear}
            aria-label="Clear"
            onClick={() => choose(null)}
          >
            ×
          </button>
        )}
        {open && (
          <ul
            id="friend-combobox-list"
            role="listbox"
            className={styles.comboList}
          >
            <li
              role="option"
              aria-selected={selected === null}
              className={`${styles.comboItem} ${selected === null ? styles.comboItemActive : ""}`}
              onClick={() => choose(null)}
            >
              Just Spotify
            </li>
            {filtered.length === 0 ? (
              <li className={styles.comboEmpty}>No matches</li>
            ) : (
              filtered.map((f) => (
                <li
                  key={f.friendshipId}
                  role="option"
                  aria-selected={selected?.friendshipId === f.friendshipId}
                  className={`${styles.comboItem} ${selected?.friendshipId === f.friendshipId ? styles.comboItemActive : ""}`}
                  onClick={() => choose(f.friendshipId)}
                >
                  {f.username}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
