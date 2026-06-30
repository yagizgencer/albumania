import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getArtist, type ArtistDetail } from "../api/artists";
import { AlbumCard } from "../components/AlbumCard";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import styles from "./ArtistPage.module.css";

export function ArtistPage() {
  const { artistId } = useParams<{ artistId: string }>();
  const [data, setData] = useState<ArtistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistId) return;
    let cancelled = false;
    setData(null);
    setError(null);
    void (async () => {
      try {
        const detail = await getArtist(artistId);
        if (!cancelled) setData(detail);
      } catch {
        if (!cancelled) setError("Could not load this artist.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (data === null) return <main className={styles.page}><LoadingState /></main>;

  const { artist, albums } = data;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {artist.image_url ? (
          <img src={artist.image_url} alt="" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden />
        )}
        <div>
          <h1 className={styles.name}>{artist.name}</h1>
          <a
            className={styles.spotifyLink}
            href={`https://open.spotify.com/artist/${artist.spotify_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Spotify ↗
          </a>
        </div>
      </header>

      {albums.length === 0 ? (
        <div className={styles.empty}>No albums found for this artist.</div>
      ) : (
        <div className={styles.grid}>
          {albums.map((a) => (
            <AlbumCard
              key={a.spotify_id}
              spotifyId={a.spotify_id}
              title={a.title}
              artist={a.artist}
              albumArtUrl={a.album_art_url}
              meanScore={a.mean_score}
              numRaters={a.num_raters}
              status={a.status}
            />
          ))}
        </div>
      )}
    </main>
  );
}
