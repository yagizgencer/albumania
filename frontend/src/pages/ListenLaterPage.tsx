import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getListenLater,
  type ListenLaterEntry,
  type ListenLaterParticipant,
} from "../api/invites";
import styles from "./ListenLaterPage.module.css";

export function ListenLaterPage() {
  const [entries, setEntries] = useState<ListenLaterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getListenLater()
      .then(setEntries)
      .catch(() => setError("Could not load Listen Later."));
  }, []);

  if (error) return <main className={styles.page}><p>{error}</p></main>;
  if (entries === null) return <main className={styles.page}><p>Loading…</p></main>;

  return (
    <main className={styles.page}>
      <h1>Listen Later</h1>
      {entries.length === 0 ? (
        <div className={styles.empty}>
          Nothing here yet. Search for an album and tap "Listen Later".
        </div>
      ) : (
        <div className={styles.list}>
          {entries.map((e) => (
            <Row key={e.album.id} entry={e} />
          ))}
        </div>
      )}
    </main>
  );
}

function Row({ entry }: { entry: ListenLaterEntry }) {
  const action = entry.rating ? "Continue Rating" : "Start Rating";
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
        <p>{entry.album.artist} · {entry.album.release_date.slice(0, 4)}</p>
        {entry.participants.length === 0 ? (
          <span className={styles.solo}>Solo</span>
        ) : (
          <div className={styles.chipRow}>
            <span style={{ color: "#6b7280", fontSize: "0.8rem", alignSelf: "center" }}>
              Listening with:
            </span>
            {entry.participants.map((p) => (
              <ParticipantChip key={p.username} p={p} />
            ))}
          </div>
        )}
      </div>
      <Link className={styles.action} to={`/albums/${entry.album.spotify_id}/rate`}>
        {action}
      </Link>
    </article>
  );
}

function ParticipantChip({ p }: { p: ListenLaterParticipant }) {
  const label =
    p.direction === "outgoing"
      ? `${p.username} (you invited)`
      : `${p.username} (invited you)`;

  let className = styles.chip;
  let suffix = "";
  if (p.they_published) {
    className = `${styles.chip} ${styles.chipDone}`;
    suffix = " · published";
  } else if (p.invite_status === "pending") {
    className = `${styles.chip} ${styles.chipPending}`;
    suffix = p.direction === "outgoing" ? " · waiting on them" : " · waiting on you";
  }
  return <span className={className}>{label}{suffix}</span>;
}
