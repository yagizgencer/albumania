import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  acceptFriendship,
  declineFriendship,
  deleteFriendship,
  listFriendships,
  sendFriendRequest,
  type Friendship,
} from "../api/friendships";
import {
  deleteAvatar,
  getUser,
  MAX_BIO_LEN,
  updateMe,
  uploadAvatar,
  type UserProfile,
} from "../api/users";
import Markdown from "react-markdown";
import { CommentComposer } from "../components/CommentComposer";
import { usePersistentState } from "../lib/usePersistentState";
import { compareStorageKey } from "../lib/dashboardCompare";
import {
  useRegisterUnsaved,
  useUnsavedNavigationGuard,
} from "../lib/unsavedChanges";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import type { ComparisonSource } from "../api/friendDashboard";
import { formatDate } from "../lib/date";
import { Avatar } from "../components/Avatar";
import { ProfileDashboard } from "./ProfileDashboardPage";
import { FriendDashboard } from "./FriendDashboardPage";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { Button } from "../components/Button";
import { ConfirmButton } from "../components/ConfirmButton";
import { Card } from "../components/Card";
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  HourglassIcon,
  LockIcon,
  PencilIcon,
  PeopleIcon,
  SearchIcon,
  SpotifyIcon,
} from "../components/Icons";
import styles from "./ProfilePage.module.css";

type AccessBlock = "friends-only" | null;

type FriendState =
  | { kind: "self" }
  | { kind: "none" }
  | { kind: "pending_sent"; friendship: Friendship }
  | { kind: "pending_received"; friendship: Friendship }
  | { kind: "friends"; friendship: Friendship };

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { username: me, refreshProfile } = useAuth();
  // Prompt before leaving with unsaved bio edits.
  const unsavedGuard = useUnsavedNavigationGuard();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Set when the solo dashboard is hidden because this profile is private /
  // friends-only, so we can show a clear card instead of an empty section.
  const [accessBlock, setAccessBlock] = useState<AccessBlock>(null);
  // The comparison we're showing, or null = solo dashboard vs Spotify. A
  // friendship source uses the precomputed pair dashboard; a user source is the
  // live comparison with any viewable profile. Persisted per profile so returning
  // from an album re-opens the same view.
  const [compareSource, setCompareSource] = usePersistentState<ComparisonSource | null>(
    compareStorageKey(username ?? ""),
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
    setAccessBlock(null);
    // compareSource is keyed by username via usePersistentState, so it
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

  // Reconcile a restored comparison against reality. `compareSource` is persisted
  // per profile in sessionStorage, so a *friendship* source can hold a stale id —
  // e.g. after unfriending and re-friending (a new friendship row, new id), or if
  // the pair is no longer friends. A stale id makes the pair dashboard 404;
  // instead, drop back to the solo dashboard. A *user* source has no id to go
  // stale (validity is enforced server-side by the visibility check).
  useEffect(() => {
    if (friendState === null || friendships === null) return; // not loaded yet
    if (compareSource === null || compareSource.kind !== "friendship") return;
    // On my own profile the combobox can point at ANY of my accepted friendships;
    // on someone else's it's only valid if it's *our* current friendship.
    const isValid = isOwner
      ? friendships.some(
          (f) => f.id === compareSource.friendshipId && f.status === "accepted"
        )
      : friendState.kind === "friends" &&
        friendState.friendship.id === compareSource.friendshipId;
    if (!isValid) setCompareSource(null);
    // setCompareSource is stable (usePersistentState); depend on the source and
    // the reconciled friend state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendState, friendships, isOwner, compareSource]);

  // Accepted friendships, with the "other" username for each, sorted by name.
  const myFriends = useMemo(() => {
    if (!me || friendships === null) return [];
    return friendships
      .filter((f) => f.status === "accepted")
      .map((f) => {
        const isA = f.user_a_username === me;
        return {
          friendshipId: f.id,
          username: isA ? f.user_b_username : f.user_a_username,
        };
      })
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [friendships, me]);

  if (error)
    return (
      <main className={styles.page}>
        <Alert>{error}</Alert>
      </main>
    );
  if (!profile)
    return (
      <main className={styles.page}>
        <LoadingState />
      </main>
    );

  const viewerCanSeeDashboard =
    isOwner || friendState?.kind === "friends" || profile.profile_visibility === "public";

  // The "Compare with" control lives inside the dashboard's controls box (passed
  // down as a slot), so it sits to the right of the filters rather than floating
  // above. My own profile gets the friend combobox; on someone else's whose
  // dashboard I can see, a compare toggle.
  const compareControl =
    isOwner && myFriends.length > 0 ? (
      <FriendCombobox
        friends={myFriends}
        selectedId={
          compareSource?.kind === "friendship" ? compareSource.friendshipId : null
        }
        onSelect={(id) =>
          setCompareSource(id === null ? null : { kind: "friendship", friendshipId: id })
        }
      />
    ) : !isOwner && viewerCanSeeDashboard ? (
      <Button
        intent="secondary"
        size="sm"
        onClick={() =>
          setCompareSource((prev) =>
            prev !== null
              ? null
              : friendState?.kind === "friends"
              ? { kind: "friendship", friendshipId: friendState.friendship.id }
              : { kind: "user", username: profile.username }
          )
        }
      >
        {compareSource !== null ? "Hide comparison" : "Compare with you"}
      </Button>
    ) : null;

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
            size={104}
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
              <p className={styles.username}>@{profile.username}</p>
              {profile.description ? (
                <div className={styles.description}>
                  <Markdown
                    components={{
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noreferrer" />
                      ),
                    }}
                  >
                    {profile.description}
                  </Markdown>
                </div>
              ) : (
                isOwner && (
                  <p className={styles.descriptionPlaceholder}>
                    No bio yet — tap the edit icon to add one.
                  </p>
                )
              )}
              <div className={styles.metaChips}>
                {!viewerCanSeeDashboard && (
                  <span
                    className={`${styles.metaChip} ${styles.privacyChip}`}
                    title="Visible to friends only"
                  >
                    <LockIcon size={13} className={styles.metaChipIcon} />
                    <span className={styles.metaChipText}>Friends only</span>
                  </span>
                )}
                <span className={styles.metaChip}>
                  <CalendarIcon size={14} className={styles.metaChipIcon} />
                  <span className={styles.metaChipText}>
                    Member since {formatDate(profile.created_at)}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
        {!editing && (
          <div className={styles.headerActions}>
            {isOwner && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconEdit}`}
                onClick={() => setEditing(true)}
                aria-label="Edit profile"
                data-tip="Edit profile"
              >
                <PencilIcon size={20} />
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
        )}
      </section>

      <section className={styles.dashboardSection}>
        <h2 className={styles.sectionTitle}>Dashboard</h2>
        {compareSource !== null &&
        // A user source is always valid here. A friendship source: on my own
        // profile it may be any accepted friendship (combobox); on someone else's
        // it must be our current friendship. (Mirrors the reconciliation effect.)
        (compareSource.kind === "user" ||
          (isOwner
            ? (friendships ?? []).some(
                (f) => f.id === compareSource.friendshipId && f.status === "accepted"
              )
            : friendState?.kind === "friends" &&
              friendState.friendship.id === compareSource.friendshipId)) ? (
          <FriendDashboard source={compareSource} compareSlot={compareControl} />
        ) : (
          <>
            {accessBlock && (
              <PrivateNotice
                friendState={friendState}
                displayName={profile.display_name}
              />
            )}
            <ProfileDashboard
              username={profile.username}
              onAccessBlocked={setAccessBlock}
              compareSlot={compareControl}
            />
          </>
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

      <UnsavedChangesModal {...unsavedGuard} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// PrivateNotice — shown in place of the dashboard when the viewer can't see it
// ---------------------------------------------------------------------------

function PrivateNotice({
  friendState,
  displayName,
}: {
  friendState: FriendState | null;
  displayName: string;
}) {
  const canAddFriend = friendState?.kind === "none";
  const requestSent = friendState?.kind === "pending_sent";

  const hint = requestSent
    ? `Your friend request is pending. Once ${displayName} accepts, you'll see their dashboard.`
    : canAddFriend
      ? `Add ${displayName} as a friend to see their listening dashboard.`
      : `${displayName} shares their dashboard with friends only.`;

  return (
    <Card className={styles.privateNotice}>
      <span className={styles.privateNoticeIcon} aria-hidden>
        🔒
      </span>
      <div>
        <h3 className={styles.privateNoticeTitle}>Friends-only profile</h3>
        <p className={styles.privateNoticeHint}>{hint}</p>
      </div>
    </Card>
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
      <Button
        intent="primary"
        size="sm"
        onClick={() => run(() => sendFriendRequest(targetUsername))}
        disabled={busy}
        title="Send friend request"
      >
        <PeopleIcon size={16} />
        Add friend
      </Button>
    );
  }

  if (state.kind === "pending_sent") {
    return (
      <Button
        intent="secondary"
        size="sm"
        onClick={() => run(() => deleteFriendship(state.friendship.id))}
        disabled={busy}
        title="Cancel friend request"
      >
        <HourglassIcon size={16} />
        Request sent
      </Button>
    );
  }

  if (state.kind === "pending_received") {
    return (
      <div className={styles.friendActions}>
        <Button
          intent="success"
          size="sm"
          onClick={() => run(() => acceptFriendship(state.friendship.id))}
          disabled={busy}
          title="Accept friend request"
        >
          <CheckIcon size={16} />
          Accept
        </Button>
        <Button
          intent="secondary"
          size="sm"
          onClick={() => run(() => declineFriendship(state.friendship.id))}
          disabled={busy}
          title="Decline friend request"
        >
          <CloseIcon size={16} />
          Decline
        </Button>
      </div>
    );
  }

  // friends — guard the unfriend with an in-site confirm (no browser alert).
  return (
    <ConfirmButton
      label={
        <>
          <CheckIcon size={16} /> Friends
        </>
      }
      prompt={`Unfriend ${targetUsername}?`}
      confirmLabel="Yes, unfriend"
      onConfirm={() => run(() => deleteFriendship(state.friendship.id))}
      intent="success"
      disabled={busy}
      title="Unfriend"
    />
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Register bio edits with the unsaved-changes guard. Dirty when either field
  // differs from the profile; "save" for the guard persists the changes.
  const editorId = useId();
  const dirty =
    displayName !== profile.display_name ||
    description !== (profile.description ?? "");
  useRegisterUnsaved(editorId, dirty, () => handleSave());

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const updated = await updateMe({
        display_name: displayName.trim(),
        description: description.trim() ? description.trim() : null,
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
        <CommentComposer
          value={description}
          onChange={setDescription}
          maxLength={MAX_BIO_LEN}
          showVisibility={false}
          placeholder="A short description that appears on your profile."
        />
      </label>
      <p className={styles.editorHint}>
        Manage who can see your dashboard in{" "}
        <Link to="/settings?tab=privacy">Settings › Privacy</Link>.
      </p>
      {err && <p className="error">{err}</p>}
      <div className={styles.editorActions}>
        <Button type="submit" intent="primary" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" intent="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
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
    <div className={styles.compareControl} ref={wrapRef} data-open={open}>
      <span className={styles.compareLabel}>Compare with</span>
      <div className={styles.searchWrap}>
        <div className={styles.searchBar} onClick={() => setOpen(true)}>
          <SearchIcon size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls="friend-combobox-list"
            placeholder={selected ? selected.username : "Spotify"}
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
              onClick={(e) => {
                e.stopPropagation();
                choose(null);
              }}
            >
              <CloseIcon size={14} />
            </button>
          )}
          <ChevronDownIcon size={17} className={styles.searchChevron} />
        </div>
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
              <span className={styles.comboSpotify}>
                <SpotifyIcon size={18} className={styles.comboSpotifyIcon} />
                Spotify
              </span>
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
