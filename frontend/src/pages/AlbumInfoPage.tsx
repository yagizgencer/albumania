import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album } from "../api/albums";
import {
  createInvite,
  type ListenInvite,
} from "../api/invites";
import {
  createRating,
  getMyRatingForAlbum,
  type Rating,
} from "../api/ratings";
import { useAuth } from "../context/AuthContext";
import { listFriendships, type Friendship } from "../api/friendships";
import styles from "./AlbumInfoPage.module.css";

interface FriendForInvite {
  username: string;
}

export function AlbumInfoPage() {
  const { spotifyId } = useParams<{ spotifyId: string }>();
  const navigate = useNavigate();
  const { username: me } = useAuth();

  const [album, setAlbum] = useState<Album | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  useEffect(() => {
    if (!spotifyId) return;
    setLoading(true);
    setError(null);
    getAlbum(spotifyId)
      .then(async (a) => {
        setAlbum(a);
        try {
          setRating(await getMyRatingForAlbum(a.id));
        } catch {
          setRating(null);
        }
      })
      .catch(() => setError("Could not load album."))
      .finally(() => setLoading(false));
  }, [spotifyId]);

  const isPublished = rating?.status === "published";
  const isDraft = rating?.status === "draft";

  async function handleAddToListenLater() {
    if (!album) return;
    setBusy(true); setActionError(null); setActionInfo(null);
    try {
      const r = await createRating(album.id);
      setRating(r);
      setActionInfo("Added to your Listen Later.");
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios error
      setActionError((e as any)?.response?.data?.detail ?? "Could not add to Listen Later.");
    } finally {
      setBusy(false);
    }
  }

  function handleContinueRating() {
    if (!album) return;
    navigate(`/albums/${album.spotify_id}/rate`);
  }

  async function handleStartRating() {
    if (!album) return;
    setBusy(true); setActionError(null);
    try {
      if (!rating) await createRating(album.id);
      navigate(`/albums/${album.spotify_id}/rate`);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setActionError((e as any)?.response?.data?.detail ?? "Could not start rating.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className={styles.page}><p>Loading…</p></main>;
  if (error || !album) return <main className={styles.page}><p className={styles.error}>{error ?? "Not found."}</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {album.album_art_url && (
          <a
            href={`https://open.spotify.com/album/${album.spotify_id}`}
            target="_blank"
            rel="noreferrer"
            title="Open on Spotify"
          >
            <img src={album.album_art_url} alt={album.title} className={styles.art} />
          </a>
        )}
        <div className={styles.meta}>
          <h1>{album.title}</h1>
          <h2>{album.artist}</h2>
          <p>
            Released {album.release_date} · {album.total_songs} tracks
          </p>

          <div className={styles.actions}>
            {isPublished && (
              <button className={`${styles.btn} ${styles.btnDisabled}`} disabled>
                Rated
              </button>
            )}
            {isDraft && (
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleContinueRating}
                disabled={busy}
              >
                Continue Rating
              </button>
            )}
            {!rating && (
              <>
                <button
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={handleAddToListenLater}
                  disabled={busy}
                >
                  Listen Later
                </button>
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={handleStartRating}
                  disabled={busy}
                >
                  Start Rating
                </button>
              </>
            )}
            {!isPublished && (
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => { setInviteModalOpen(true); setActionError(null); setActionInfo(null); }}
                disabled={busy}
              >
                Invite a friend
              </button>
            )}
          </div>
          {actionError && <p className={styles.error}>{actionError}</p>}
          {actionInfo && <p className={styles.info}>{actionInfo}</p>}
        </div>
      </header>

      <section className={styles.tracks}>
        <h3>Tracks</h3>
        <ol>
          {album.tracks.map((t) => (
            <li key={t.index}>
              {t.spotify_url ? (
                <a href={t.spotify_url} target="_blank" rel="noreferrer">
                  {t.name}
                </a>
              ) : (
                t.name
              )}
            </li>
          ))}
        </ol>
      </section>

      {inviteModalOpen && me && (
        <InviteModal
          albumId={album.id}
          me={me}
          onClose={() => setInviteModalOpen(false)}
          onSent={(friend: FriendForInvite) => {
            setActionInfo(`Invite sent to ${friend.username}.`);
            setInviteModalOpen(false);
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Invite modal — searchable list of accepted friends
// ---------------------------------------------------------------------------

function InviteModal({
  albumId,
  me,
  onClose,
  onSent,
}: {
  albumId: number;
  me: string;
  onClose: () => void;
  onSent: (friend: FriendForInvite) => void;
}) {
  const [friends, setFriends] = useState<Friendship[] | null>(null);
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    listFriendships()
      .then((data) => setFriends(data.accepted))
      .catch(() => setFriends([]));
  }, []);

  const friendUsernames = useMemo(() => {
    if (!friends) return [];
    return friends
      .map((f) => (f.user_a_username === me ? f.user_b_username : f.user_a_username))
      .filter((u) => u.toLowerCase().includes(filter.toLowerCase()))
      .sort();
  }, [friends, me, filter]);

  async function handleSend(username: string) {
    setSending(username);
    setErrors((prev) => { const { [username]: _, ...rest } = prev; return rest; });
    try {
      const invite: ListenInvite = await createInvite(username, albumId);
      setSentSet((prev) => new Set(prev).add(username));
      onSent({ username });
      void invite;
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail ?? "Could not send invite.";
      setErrors((prev) => ({ ...prev, [username]: detail }));
    } finally {
      setSending(null);
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Invite a friend</h3>
        <input
          type="search"
          placeholder="Search friends…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        {friends === null ? (
          <p>Loading friends…</p>
        ) : friendUsernames.length === 0 ? (
          <p style={{ color: "#6b7280" }}>
            {friends.length === 0 ? "You have no friends yet." : "No matches."}
          </p>
        ) : (
          <ul className={styles.friendList}>
            {friendUsernames.map((username) => {
              const isSent = sentSet.has(username);
              const err = errors[username];
              return (
                <li key={username} className={styles.friendItem}>
                  <div>
                    <div>{username}</div>
                    {err && <small className={styles.error}>{err}</small>}
                  </div>
                  <button
                    onClick={() => handleSend(username)}
                    disabled={isSent || sending === username}
                  >
                    {isSent ? "Sent" : sending === username ? "Sending…" : "Invite"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.modalFooter}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
