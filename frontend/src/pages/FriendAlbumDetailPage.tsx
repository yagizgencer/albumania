import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album, type AlbumTrack } from "../api/albums";
import {
  getFriendDashboard,
  type FriendDashboardEntry,
  type FriendDashboardResponse,
} from "../api/friendDashboard";
import { formatDuration } from "../utils/duration";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import styles from "./AlbumDetailPage.module.css";

export function FriendAlbumDetailPage() {
  const { friendshipId, spotifyId } = useParams<{
    friendshipId: string;
    spotifyId: string;
  }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [pair, setPair] = useState<FriendDashboardResponse | null>(null);
  const [entry, setEntry] = useState<FriendDashboardEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!friendshipId || !spotifyId) return;
    const fid = Number(friendshipId);
    if (!Number.isFinite(fid)) return;
    setError(null);

    Promise.all([getFriendDashboard(fid), getAlbum(spotifyId)])
      .then(([pairData, albumData]) => {
        setPair(pairData);
        setAlbum(albumData);
        const match = pairData.entries.find((e) => e.album.spotify_id === spotifyId);
        if (!match) {
          setError("This album isn't on the pair dashboard yet.");
        } else {
          setEntry(match);
        }
      })
      .catch((err) => {
        if (err?.response?.status === 403) setError("Access denied.");
        else if (err?.response?.status === 404) setError("Not found.");
        else setError("Could not load album.");
      });
  }, [friendshipId, spotifyId]);

  const trackByIndex = useMemo(
    () => new Map<number, AlbumTrack>((album?.tracks ?? []).map((t) => [t.index, t])),
    [album]
  );

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (!album || !pair || !entry)
    return <main className={styles.page}><LoadingState /></main>;

  const renderList = (indices: number[]) =>
    indices
      .map((idx) => trackByIndex.get(idx))
      .filter((t): t is AlbumTrack => t !== undefined);

  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;

  return (
    <main className={styles.page}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className={styles.backLink}
      >
        ← Back to pair dashboard
      </button>

      <header className={styles.header}>
        {album.album_art_url && (
          <a href={spotifyAlbumUrl} target="_blank" rel="noreferrer">
            <img src={album.album_art_url} alt="" className={styles.art} />
          </a>
        )}
        <div className={styles.meta}>
          <h1>{album.title}</h1>
          <h2>{album.artist}</h2>
          <p>
            <strong>Release date:</strong> {album.release_date}
            <br />
            <strong>Rated:</strong> {entry.mutual_date.slice(0, 10)}
            <br />
            <strong>Total songs:</strong> {album.total_songs}
            {album.tracks.some((t) => t.duration_ms != null) && (
              <>
                <br />
                <strong>Total duration:</strong>{" "}
                {formatDuration(album.tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0))}
              </>
            )}
          </p>

          <div className={styles.metricRow}>
            <div className={styles.metric}>
              Scores
              <strong>
                {pair.user_a_username}: {entry.user_a_score.toFixed(1)}
                <br />
                {pair.user_b_username}: {entry.user_b_score.toFixed(1)}
                <br />
                Mean: {entry.mean_score.toFixed(2)}
              </strong>
            </div>
            <div className={styles.metric}>
              Similarity
              <strong>
                {pair.user_a_username} ↔ {pair.user_b_username}: {fmt(entry.similarity_users)}
                <br />
                {pair.user_a_username} ↔ Spotify: {fmt(entry.similarity_a_vs_spotify)}
                <br />
                {pair.user_b_username} ↔ Spotify: {fmt(entry.similarity_b_vs_spotify)}
              </strong>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.columns}>
        <TopList
          title={`${pair.user_a_username}'s top 5`}
          tracks={renderList(entry.user_a_top_track_indices)}
        />
        <TopList
          title={`${pair.user_b_username}'s top 5`}
          tracks={renderList(entry.user_b_top_track_indices)}
        />
        <TopList
          title="Spotify's top 5"
          tracks={renderList(entry.spotify_top5_indices)}
        />
      </section>
    </main>
  );
}

interface TopListProps {
  title: string;
  tracks: AlbumTrack[];
}

function TopList({ title, tracks }: TopListProps) {
  return (
    <div className={styles.column}>
      <h3>{title}</h3>
      <ol>
        {tracks.map((t) => (
          <li key={t.index}>
            <span className={styles.trackRowInner}>
              <span className={styles.trackRowName}>
                {t.spotify_url ? (
                  <a href={t.spotify_url} target="_blank" rel="noreferrer">{t.name}</a>
                ) : (
                  t.name
                )}
              </span>
              <span className={styles.trackRowMeta}>
                #{t.index}
                {t.duration_ms != null && <> · {formatDuration(t.duration_ms)}</>}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(3);
}
