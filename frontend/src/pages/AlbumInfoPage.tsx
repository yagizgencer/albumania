import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAlbum, getAlbumStats, type Album, type AlbumStats } from "../api/albums";
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
import { formatDuration } from "../utils/duration";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { formatDate } from "../lib/date";
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
  const [stats, setStats] = useState<AlbumStats | null>(null);
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
        try {
          setStats(await getAlbumStats(spotifyId));
        } catch {
          setStats(null);
        }
      })
      .catch(() => setError("Could not load album."))
      .finally(() => setLoading(false));
  }, [spotifyId]);

  const isPublished = rating?.status === "published";
  const isDraft = rating?.status === "draft";

  // The viewer's top-5 track indices (1-based), only relevant once published.
  const top5Set = useMemo(() => {
    if (rating?.status !== "published" || !rating.top_track_indices) {
      return new Set<number>();
    }
    return new Set(
      rating.top_track_indices.filter((i): i is number => i != null)
    );
  }, [rating]);

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

  if (loading) return <main className={styles.page}><LoadingState /></main>;
  if (error || !album) return <main className={styles.page}><Alert>{error ?? "Not found."}</Alert></main>;

  const totalMs = album.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const hasAnyDuration = album.tracks.some((t) => t.duration_ms != null);
  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {album.album_art_url && (
          <a
            href={spotifyAlbumUrl}
            target="_blank"
            rel="noreferrer"
            title="Open on Spotify"
          >
            <img src={album.album_art_url} alt="" className={styles.art} />
          </a>
        )}
        <div className={styles.meta}>
          <h1>
            <a
              className={styles.headerLink}
              href={spotifyAlbumUrl}
              target="_blank"
              rel="noreferrer"
            >
              {album.title}
            </a>
          </h1>
          <h2>
            {album.artist_spotify_id ? (
              <a
                className={styles.headerLink}
                href={`https://open.spotify.com/artist/${album.artist_spotify_id}`}
                target="_blank"
                rel="noreferrer"
              >
                {album.artist}
              </a>
            ) : (
              album.artist
            )}
          </h2>
          <p>
            Released {formatDate(album.release_date)} · {album.total_songs} tracks
            {hasAnyDuration && <> · {formatDuration(totalMs)}</>}
          </p>

          <p className={styles.stats}>
            {stats && stats.num_raters > 0 && stats.mean_score !== null ? (
              <>
                <strong>{stats.mean_score.toFixed(1)}</strong> ·{" "}
                {stats.num_raters} {stats.num_raters === 1 ? "rating" : "ratings"}
              </>
            ) : (
              "No ratings yet"
            )}
            {isPublished && rating?.score != null && (
              <> · Your score: <strong>{rating.score.toFixed(1)}</strong></>
            )}
          </p>

          <div className={styles.actions}>
            {album.artist_spotify_id && (
              <Link
                className={`${styles.btn} ${styles.btnSecondary}`}
                to={`/artists/${album.artist_spotify_id}`}
              >
                Go to artist page
              </Link>
            )}
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
          {actionError && <Alert>{actionError}</Alert>}
          {actionInfo && <p className={styles.info}>{actionInfo}</p>}
        </div>
      </header>

      <section className={styles.tracks}>
        <h3>Tracks</h3>
        <ul className={styles.trackList}>
          {album.tracks.map((t) => (
            <li key={t.index} className={styles.trackRow}>
              <span className={styles.trackNum}>{t.index}.</span>
              <span className={styles.trackName}>
                {t.spotify_url ? (
                  <a href={t.spotify_url} target="_blank" rel="noreferrer">
                    {t.name}
                  </a>
                ) : (
                  t.name
                )}
                {isPublished && top5Set.has(t.index) && (
                  <span className={styles.top5}>Top 5</span>
                )}
              </span>
              <span className={styles.trackDuration}>{formatDuration(t.duration_ms)}</span>
            </li>
          ))}
        </ul>
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
