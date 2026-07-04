import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  getListenLater,
  listMyInvites,
  type ListenInviteWithAlbum,
  type ListenLaterEntry,
  type ListenLaterParticipant,
} from "../api/invites";
import { deleteRating } from "../api/ratings";
import { Avatar } from "../components/Avatar";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { profilePath } from "../lib/paths";
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
      setError("Could not load Listen Later.");
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
      <h1>Listen Later</h1>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <section className={styles.sideSection}>
            <h2>Incoming invites</h2>
            {incoming.length === 0 ? (
              <p className={styles.sidebarEmpty}>No invites right now.</p>
            ) : (
              incoming.map((inv) => (
                <SidebarInvite
                  key={inv.id}
                  invite={inv}
                  variant="incoming"
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))
            )}
          </section>

          <section className={styles.sideSection}>
            <h2>Outgoing invites</h2>
            {outgoing.length === 0 ? (
              <p className={styles.sidebarEmpty}>Nothing pending.</p>
            ) : (
              outgoing.map((inv) => (
                <SidebarInvite
                  key={inv.id}
                  invite={inv}
                  variant="outgoing"
                  onCancel={handleCancel}
                />
              ))
            )}
          </section>
        </aside>

        <section className={styles.main}>
          {entries.length === 0 ? (
            <div className={styles.empty}>
              Nothing here yet. Search for an album and tap "Listen Later".
            </div>
          ) : (
            <div className={styles.list}>
              {entries.map((e) => (
                <Row key={e.album.id} entry={e} onRemoved={reload} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
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
  const blurb =
    variant === "incoming"
      ? `${other} invited you`
      : `Waiting on ${other}`;

  return (
    <article className={styles.sideItem}>
      <Link to={`/albums/${invite.album.spotify_id}`} className={styles.sideAlbum}>
        {invite.album.album_art_url && (
          <img
            className={styles.sideArt}
            src={invite.album.album_art_url}
            alt={invite.album.title}
          />
        )}
        <div className={styles.sideMeta}>
          <strong>{invite.album.title}</strong>
          <span>{invite.album.artist}</span>
        </div>
      </Link>
      <div className={styles.sideFooter}>
        <span className={styles.sideBlurb}>
          <Avatar username={other} pictureUrl={otherPic} size={18} />
          <Link to={profilePath(other)}>{blurb}</Link>
        </span>
        <span className={styles.sideActions}>
          {variant === "incoming" ? (
            <>
              <button
                className={styles.sideBtnPrimary}
                onClick={() => run(() => onAccept!(invite.id))}
                disabled={busy}
              >
                Accept
              </button>
              <button
                className={styles.sideBtnGhost}
                onClick={() => run(() => onDecline!(invite.id))}
                disabled={busy}
              >
                Decline
              </button>
            </>
          ) : (
            <button
              className={styles.sideBtnGhost}
              onClick={() => run(() => onCancel!(invite.id))}
              disabled={busy}
            >
              Cancel
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

function Row({ entry, onRemoved }: { entry: ListenLaterEntry; onRemoved: () => Promise<void> }) {
  const action = entry.rating ? "Continue Rating" : "Start Rating";
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!entry.rating) return;
    setRemoving(true);
    try {
      await deleteRating(entry.rating.id);
      await onRemoved();
    } finally {
      setRemoving(false);
    }
  }

  // Pending invites don't yet count as a shared listen — render those rows
  // as solo until the other side accepts.
  const activeParticipants = entry.participants.filter(
    (p) => p.invite_status === "accepted"
  );
  return (
    <article className={styles.row}>
      <Link to={`/albums/${entry.album.spotify_id}`}>
        {entry.album.album_art_url && (
          <img
            className={styles.art}
            src={entry.album.album_art_url}
            alt={entry.album.title}
          />
        )}
      </Link>
      <div className={styles.info}>
        <h3>
          <Link to={`/albums/${entry.album.spotify_id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {entry.album.title}
          </Link>
        </h3>
        <p>
          {entry.album.artist_spotify_id ? (
            <Link
              to={`/artists/${entry.album.artist_spotify_id}`}
              className={styles.artistLink}
            >
              {entry.album.artist}
            </Link>
          ) : (
            entry.album.artist
          )}{" "}
          · {entry.album.release_date.slice(0, 4)}
        </p>
        {activeParticipants.length > 0 && (
          <div className={styles.chipRow}>
            <span style={{ color: "#6b7280", fontSize: "0.8rem", alignSelf: "center" }}>
              Listening with:
            </span>
            {activeParticipants.map((p) => (
              <ParticipantChip key={p.username} p={p} />
            ))}
          </div>
        )}
      </div>
      <div className={styles.actions}>
        {confirming ? (
          <div className={styles.confirm}>
            <span className={styles.confirmText}>Remove from Listen Later?</span>
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
            <Link className={styles.action} to={`/albums/${entry.album.spotify_id}/rate`}>
              {action}
            </Link>
            {entry.rating && (
              <button className={styles.removeBtn} onClick={() => setConfirming(true)}>
                Remove
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function ParticipantChip({ p }: { p: ListenLaterParticipant }) {
  const tag =
    p.direction === "outgoing" ? "(you invited)" : "(invited you)";

  let className = styles.chip;
  let suffix = "";
  if (p.they_published) {
    className = `${styles.chip} ${styles.chipDone}`;
    suffix = " · published";
  } else if (p.invite_status === "pending") {
    className = `${styles.chip} ${styles.chipPending}`;
    suffix = p.direction === "outgoing" ? " · waiting on them" : " · waiting on you";
  }
  return (
    <span className={className}>
      <Link to={profilePath(p.username)} className={styles.chipUser}>
        <Avatar username={p.username} pictureUrl={p.picture_url} size={18} />
        <span style={{ marginLeft: 6 }}>{p.username}</span>
      </Link>
      <span style={{ marginLeft: 4 }}>{tag}{suffix}</span>
    </span>
  );
}
