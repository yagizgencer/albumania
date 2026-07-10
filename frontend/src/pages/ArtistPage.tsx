import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getArtist, type ArtistDetail } from "../api/artists";
import { AlbumCard } from "../components/AlbumCard";
import { Alert } from "../components/Alert";
import { ExternalLinkIcon, SpotifyIcon } from "../components/Icons";
import { ImageLightbox } from "../components/ImageLightbox";
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
          <ImageLightbox
            src={artist.image_url}
            alt={`${artist.name} photo`}
            thumbClassName={styles.avatar}
          />
        ) : (
          <div className={styles.avatarPlaceholder} aria-hidden />
        )}
        <div>
          <h1 className={styles.name}>
            {artist.name}
            {/* Pop-out to the artist on Spotify: a small Spotify mark + arrow as a
                superscript badge at the top-right of the name (same as the album page). */}
            <a
              className={styles.spotifyLink}
              href={`https://open.spotify.com/artist/${artist.spotify_id}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on Spotify"
              title="Open on Spotify"
            >
              <ExternalLinkIcon size={19} className={styles.spotifyArrow} />
              <SpotifyIcon size={27} className={styles.spotifyMark} />
            </a>
          </h1>
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
              albumArtUrl={a.album_art_url}
              releaseDate={a.release_date}
              totalSongs={a.total_songs}
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
