import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getAlbum, type Album } from "../api/albums";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import { formatDuration } from "../utils/duration";
import styles from "./AlbumDetailPage.module.css";

export function AlbumDetailPage() {
  const { username, spotifyId } = useParams<{ username: string; spotifyId: string }>();
  const [album, setAlbum] = useState<Album | null>(null);
  const [entry, setEntry] = useState<DashboardEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !spotifyId) return;
    setError(null);
    Promise.all([getAlbum(spotifyId), getDashboard(username)])
      .then(([albumData, dashboard]) => {
        setAlbum(albumData);
        const match = dashboard.entries.find((e) => e.album.spotify_id === spotifyId);
        if (!match) {
          setError(`${username} hasn't published a rating for this album yet.`);
        } else {
          setEntry(match);
        }
      })
      .catch((err) => {
        if (err?.response?.status === 403) setError("This profile is private.");
        else if (err?.response?.status === 404) setError("Not found.");
        else setError("Could not load album.");
      });
  }, [username, spotifyId]);

  if (error) return <main className={styles.page}><p className="error">{error}</p></main>;
  if (!album || !entry) return <main className={styles.page}><p>Loading…</p></main>;

  const trackByIndex = new Map(album.tracks.map((t) => [t.index, t]));
  const renderList = (indices: number[]) =>
    indices
      .map((idx) => trackByIndex.get(idx))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const userTracks = renderList(entry.top_track_indices);
  const spotifyTracks = renderList(entry.spotify_top5_indices);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {album.album_art_url && (
          <a
            href={`https://open.spotify.com/album/${album.spotify_id}`}
            target="_blank"
            rel="noreferrer"
          >
            <img src={album.album_art_url} alt="" className={styles.art} />
          </a>
        )}
        <div className={styles.meta}>
          <h1>{album.title}</h1>
          <h2>{album.artist}</h2>
          <p>
            Released {album.release_date} · {album.total_songs} tracks
            {album.tracks.some((t) => t.duration_ms != null) && (
              <>
                {" "}
                · {formatDuration(album.tracks.reduce((s, t) => s + (t.duration_ms ?? 0), 0))}
              </>
            )}
          </p>
          <div className={styles.metricRow}>
            <div className={styles.metric}>
              Score
              <strong>{entry.score.toFixed(1)}</strong>
            </div>
            <div className={styles.metric}>
              Similarity vs Spotify
              <strong>
                {entry.similarity_user_vs_spotify === null
                  ? "—"
                  : entry.similarity_user_vs_spotify.toFixed(2)}
              </strong>
            </div>
            <div className={styles.metric}>
              Rated on
              <strong>{entry.completed_at.slice(0, 10)}</strong>
            </div>
          </div>
        </div>
      </header>

      <section className={styles.columns}>
        <div className={styles.column}>
          <h3>{username}'s top 5</h3>
          <ol>
            {userTracks.map((t) => (
              <li key={t.index}>
                <span className={styles.trackRowInner}>
                  <span className={styles.trackRowName}>
                    {t.spotify_url ? (
                      <a href={t.spotify_url} target="_blank" rel="noreferrer">
                        {t.name}
                      </a>
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

        <div className={styles.column}>
          <h3>Spotify's top 5</h3>
          <ol>
            {spotifyTracks.map((t) => (
              <li key={t.index}>
                <span className={styles.trackRowInner}>
                  <span className={styles.trackRowName}>
                    {t.spotify_url ? (
                      <a href={t.spotify_url} target="_blank" rel="noreferrer">
                        {t.name}
                      </a>
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
      </section>
    </main>
  );
}
