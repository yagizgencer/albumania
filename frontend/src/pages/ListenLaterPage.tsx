import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  getListenLater,
  listMyInvites,
  removeFromListenLater,
  type ListenInviteWithAlbum,
  type ListenLaterEntry,
  type ListenLaterParticipant,
} from "../api/invites";
import { Avatar } from "../components/Avatar";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import {
  CheckIcon,
  CloseIcon,
  DiscIcon,
  HeadphonesIcon,
  HourglassIcon,
  StarIcon,
  TrashIcon,
} from "../components/Icons";
import { profilePath } from "../lib/paths";
import { formatDate } from "../lib/date";
import { formatDuration } from "../utils/duration";
import styles from "./ListenLaterPage.module.css";

export function ListenLaterPage() {
  const [entries, setEntries] = useState<ListenLaterEntry[] | null>(null);
  const [incoming, setIncoming] = useState<ListenInviteWithAlbum[]>([]);
  const [outgoing, setOutgoing] = useState<ListenInviteWithAlbum[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const [later, invites] = await Promise.all([getListenLater(), listMyInvites()]);
      setEntries(later);
      setIncoming(invites.incoming);
      setOutgoing(invites.outgoing.filter((i) => i.status === "pending"));
    } catch {
      setError("Could not load Listen & Rate.");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleAccept(id: number) {
    await acceptInvite(id);
    await reload();
  }
  async function handleDecline(id: number) {
    await declineInvite(id);
    await reload();
  }
  async function handleCancel(id: number) {
    await cancelInvite(id);
    await reload();
  }

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (entries === null) return <main className={styles.page}><LoadingState /></main>;

  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>Listen &amp; Rate</h1>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <InviteBox title="Incoming invites" count={incoming.length} empty="No invites right now.">
            {incoming.map((inv) => (
              <SidebarInvite
                key={inv.id}
                invite={inv}
                variant="incoming"
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            ))}
          </InviteBox>

          <InviteBox title="Outgoing invites" count={outgoing.length} empty="Nothing pending.">
            {outgoing.map((inv) => (
              <SidebarInvite
                key={inv.id}
                invite={inv}
                variant="outgoing"
                onCancel={handleCancel}
              />
            ))}
          </InviteBox>
        </aside>

        <section>
          {entries.length === 0 ? (
            <div className={styles.empty}>
              Nothing here yet. Search for an album and tap “Listen & Rate”.
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {entries.map((e) => (
                <EntryCard key={e.album.id} entry={e} onRemoved={reload} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Invite box — styled like the Home trending boxes.
// ---------------------------------------------------------------------------

function InviteBox({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.tbox}>
      <div className={styles.tboxHead}>
        <span className={styles.tboxTitle}>{title}</span>
        {count > 0 && <span className={styles.tboxCount}>{count}</span>}
      </div>
      <div className={styles.tlist}>
        {count === 0 ? <p className={styles.emptyLine}>{empty}</p> : children}
      </div>
    </section>
  );
}

function SidebarInvite({
  invite,
  variant,
  onAccept,
  onDecline,
  onCancel,
}: {
  invite: ListenInviteWithAlbum;
  variant: "incoming" | "outgoing";
  onAccept?: (id: number) => Promise<void>;
  onDecline?: (id: number) => Promise<void>;
  onCancel?: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }

  const other = variant === "incoming" ? invite.sender_username : invite.receiver_username;
  const otherPic = variant === "incoming" ? invite.sender_picture_url : invite.receiver_picture_url;

  return (
    <div className={styles.tRow}>
      <Link to={`/albums/${invite.album.spotify_id}`} className={styles.tArtLink} aria-hidden tabIndex={-1}>
        {invite.album.album_art_url ? (
          <img className={styles.tArt} src={invite.album.album_art_url} alt="" />
        ) : (
          <span className={`${styles.tArt} ${styles.tArtEmpty}`} aria-hidden>♪</span>
        )}
      </Link>
      <div className={styles.tInfo}>
        <Link className={styles.tTitle} to={`/albums/${invite.album.spotify_id}`}>
          {invite.album.title}
        </Link>
        <span className={styles.tSub}>{invite.album.artist}</span>
        <span className={styles.fromLine}>
          {variant === "incoming" ? (
            <>
              <Avatar username={other} pictureUrl={otherPic} size={16} />
              <Link to={profilePath(other)}>{other}</Link>
              <span>invited you</span>
            </>
          ) : (
            <>
              <span>Invited</span>
              <Avatar username={other} pictureUrl={otherPic} size={16} />
              <Link to={profilePath(other)}>{other}</Link>
            </>
          )}
        </span>
      </div>
      <div className={styles.tActions}>
        {variant === "incoming" ? (
          <>
            <button
              className={`${styles.iconBtn} ${styles.iconBtnSm} ${styles.iconAccept}`}
              onClick={() => run(() => onAccept!(invite.id))}
              disabled={busy}
              aria-label="Accept"
              data-tip="Accept"
            >
              <CheckIcon size={16} />
            </button>
            <button
              className={`${styles.iconBtn} ${styles.iconBtnSm} ${styles.iconDecline}`}
              onClick={() => run(() => onDecline!(invite.id))}
              disabled={busy}
              aria-label="Decline"
              data-tip="Decline"
            >
              <CloseIcon size={16} />
            </button>
          </>
        ) : (
          <button
            className={`${styles.iconBtn} ${styles.iconBtnSm} ${styles.iconDecline}`}
            onClick={() => run(() => onCancel!(invite.id))}
            disabled={busy}
            aria-label="Cancel"
            data-tip="Cancel"
          >
            <CloseIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue card
// ---------------------------------------------------------------------------

function EntryCard({ entry, onRemoved }: { entry: ListenLaterEntry; onRemoved: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeFromListenLater(entry.album.id);
      await onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  // Pending invites don't count as a shared listen yet — treat those as solo.
  const activeParticipants = entry.participants.filter(
    (p) => p.invite_status === "accepted"
  );
  const totalMs = entry.album.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const hasAnyDuration = entry.album.tracks.some((t) => t.duration_ms != null);

  return (
    <article className={styles.qcard}>
      <Link className={styles.qcoverLink} to={`/albums/${entry.album.spotify_id}`} aria-hidden tabIndex={-1}>
        {entry.album.album_art_url ? (
          <img className={styles.qcover} src={entry.album.album_art_url} alt="" />
        ) : (
          <span className={`${styles.qcover} ${styles.qcoverEmpty}`} aria-hidden>♪</span>
        )}
      </Link>

      <div className={styles.qbody}>
        <Link className={styles.entryTitle} to={`/albums/${entry.album.spotify_id}`}>
          {entry.album.title}
        </Link>
        {entry.album.artist_spotify_id ? (
          <Link className={styles.entryArtist} to={`/artists/${entry.album.artist_spotify_id}`}>
            {entry.album.artist}
          </Link>
        ) : (
          <span className={styles.entryArtist}>{entry.album.artist}</span>
        )}
        <div className={styles.metaChips}>
          <span className={styles.metaChip}>
            <DiscIcon size={14} className={styles.metaChipIcon} />
            <span className={styles.metaChipText}>{formatDate(entry.album.release_date)}</span>
          </span>
          {hasAnyDuration && (
            <span className={styles.metaChip}>
              <HourglassIcon size={14} className={styles.metaChipIcon} />
              <span className={styles.metaChipText}>{formatDuration(totalMs)}</span>
            </span>
          )}
        </div>
      </div>

      <div className={styles.qFooter}>
        {confirming ? (
          <div className={styles.confirm}>
            <span className={styles.confirmText}>Remove from Listen & Rate?</span>
            <div className={styles.confirmButtons}>
              <button
                className={styles.removeConfirmBtn}
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? "Removing…" : "Yes, remove"}
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => setConfirming(false)}
                disabled={removing}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.qActions}>
              <Link
                className={`${styles.iconBtn} ${styles.iconRate}`}
                to={`/albums/${entry.album.spotify_id}/rate`}
                state={{ from: "/listen-later" }}
                aria-label="Rate"
                data-tip="Rate"
              >
                <StarIcon size={22} />
              </Link>
              <button
                className={`${styles.iconBtn} ${styles.iconRemove}`}
                onClick={() => setConfirming(true)}
                aria-label="Remove"
                data-tip="Remove"
              >
                <TrashIcon size={22} />
              </button>
            </div>
            {activeParticipants.length > 0 && (
              <ListeningWithStack participants={activeParticipants} />
            )}
          </>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ListeningWithStack — a compact avatar stack (2 photos + "+N") in the card's
// bottom corner. Clicking opens a scrollable dropdown (album-page combo styling)
// with each participant's invite direction + rating/published status.
// ---------------------------------------------------------------------------

const MAX_AVATARS = 2;

function ListeningWithStack({ participants }: { participants: ListenLaterParticipant[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  const shown = participants.slice(0, MAX_AVATARS);
  const extra = participants.length - shown.length;
  const label = `Listening with ${participants.length} ${
    participants.length === 1 ? "person" : "people"
  }`;

  return (
    <div className={styles.lwrap} ref={wrapRef} data-open={open}>
      {/* The chip opens the dropdown; the avatars inside are their own links to
          each friend's profile (they stop the click from opening the dropdown). */}
      <div
        className={styles.lwChip}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-expanded={open}
        aria-label={label}
      >
        <span className={styles.lwIcon}>
          <HeadphonesIcon size={18} />
        </span>
        <span className={styles.lwAvatars}>
          {shown.map((p) => (
            <Link
              key={p.username}
              to={profilePath(p.username)}
              className={styles.lwAvatarLink}
              onClick={(e) => e.stopPropagation()}
              aria-label={p.username}
              data-tip={p.username}
            >
              <Avatar
                username={p.username}
                pictureUrl={p.picture_url}
                size={24}
                className={styles.lwAvatar}
              />
            </Link>
          ))}
          {extra > 0 && <span className={styles.lwMore}>+{extra}</span>}
        </span>
      </div>
      {open && (
        <ul role="listbox" className={styles.comboList}>
          {participants.map((p) => (
            <li key={p.username} role="option" aria-selected={false} className={styles.comboItem}>
              <Avatar username={p.username} pictureUrl={p.picture_url} size={32} />
              <span className={styles.comboText}>
                <Link className={styles.comboName} to={profilePath(p.username)}>
                  {p.username}
                </Link>
                <span className={styles.comboUser}>
                  {p.direction === "outgoing" ? "You invited" : "Invited you"}
                </span>
              </span>
              <span
                className={`${styles.statusPill} ${
                  p.they_published ? styles.statusDone : styles.statusRating
                }`}
              >
                {p.they_published ? "Published" : "Rating…"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
