import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  listMyInvites,
  type ListenInviteWithAlbum,
} from "../api/invites";
import styles from "./ListenLaterPage.module.css";

export function InvitesPage() {
  const [incoming, setIncoming] = useState<ListenInviteWithAlbum[] | null>(null);
  const [outgoing, setOutgoing] = useState<ListenInviteWithAlbum[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const invites = await listMyInvites();
      setIncoming(invites.incoming);
      setOutgoing(invites.outgoing);
    } catch {
      setError("Could not load invites.");
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

  if (error) return <main className={styles.page}><p>{error}</p></main>;
  if (incoming === null) return <main className={styles.page}><p>Loading…</p></main>;

  const empty = incoming.length === 0 && outgoing.length === 0;

  return (
    <main className={styles.page}>
      <h1>Invites</h1>

      {empty && (
        <div className={styles.empty}>
          No invites. Open an album and tap "Invite a friend" to start one.
        </div>
      )}

      {incoming.length > 0 && (
        <section className={styles.incomingSection}>
          <h2>Incoming</h2>
          <div className={styles.list}>
            {incoming.map((inv) => (
              <IncomingInviteRow
                key={inv.id}
                invite={inv}
                onAccept={handleAccept}
                onDecline={handleDecline}
              />
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className={styles.incomingSection}>
          <h2>Outgoing</h2>
          <div className={styles.list}>
            {outgoing.map((inv) => (
              <OutgoingInviteRow key={inv.id} invite={inv} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function OutgoingInviteRow({
  invite,
  onCancel,
}: {
  invite: ListenInviteWithAlbum;
  onCancel: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function handleCancel() {
    setBusy(true);
    try { await onCancel(invite.id); } finally { setBusy(false); }
  }
  return (
    <article className={styles.row}>
      <Link to={`/albums/${invite.album.spotify_id}`}>
        {invite.album.album_art_url && (
          <img
            className={styles.art}
            src={invite.album.album_art_url}
            alt={invite.album.title}
          />
        )}
      </Link>
      <div className={styles.info}>
        <h3>
          <Link to={`/albums/${invite.album.spotify_id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {invite.album.title}
          </Link>
        </h3>
        <p>{invite.album.artist} · {invite.album.release_date.slice(0, 4)}</p>
        <p className={styles.solo}>
          Waiting on {invite.receiver_username} to accept.
        </p>
      </div>
      <button
        className={styles.actionGhost}
        onClick={handleCancel}
        disabled={busy}
      >
        Cancel
      </button>
    </article>
  );
}

function IncomingInviteRow({
  invite,
  onAccept,
  onDecline,
}: {
  invite: ListenInviteWithAlbum;
  onAccept: (id: number) => Promise<void>;
  onDecline: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  }
  return (
    <article className={styles.row}>
      <Link to={`/albums/${invite.album.spotify_id}`}>
        {invite.album.album_art_url && (
          <img
            className={styles.art}
            src={invite.album.album_art_url}
            alt={invite.album.title}
          />
        )}
      </Link>
      <div className={styles.info}>
        <h3>
          <Link to={`/albums/${invite.album.spotify_id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {invite.album.title}
          </Link>
        </h3>
        <p>{invite.album.artist} · {invite.album.release_date.slice(0, 4)}</p>
        <p className={styles.solo}>
          {invite.sender_username} invited you to listen.
        </p>
      </div>
      <div className={styles.inviteActions}>
        <button
          className={styles.action}
          onClick={() => run(() => onAccept(invite.id))}
          disabled={busy}
        >
          Accept
        </button>
        <button
          className={styles.actionGhost}
          onClick={() => run(() => onDecline(invite.id))}
          disabled={busy}
        >
          Decline
        </button>
      </div>
    </article>
  );
}
