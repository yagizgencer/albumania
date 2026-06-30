import { Link } from "react-router-dom";
import type { DashboardAlbum } from "../api/dashboard";
import styles from "./DashboardAlbumCell.module.css";

// Stop the click from bubbling up to the table row's navigate handler, so
// these links/buttons go where they say instead of opening the row detail.
function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export function DashboardAlbumCell({ album }: { album: DashboardAlbum }) {
  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;
  const spotifyArtistUrl = album.artist_spotify_id
    ? `https://open.spotify.com/artist/${album.artist_spotify_id}`
    : null;

  return (
    <div className={styles.cell}>
      {album.album_art_url && (
        <a href={spotifyAlbumUrl} target="_blank" rel="noreferrer" onClick={stop} title="Open on Spotify">
          <img src={album.album_art_url} alt="" className={styles.art} />
        </a>
      )}
      <span className={styles.text}>
        <a
          className={styles.title}
          href={spotifyAlbumUrl}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
        >
          {album.title}
        </a>
        {spotifyArtistUrl ? (
          <a
            className={styles.artist}
            href={spotifyArtistUrl}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
          >
            {album.artist}
          </a>
        ) : (
          <small className={styles.artist}>{album.artist}</small>
        )}
        <span className={styles.actions}>
          <Link className={styles.actionBtn} to={`/albums/${album.spotify_id}`} onClick={stop}>
            Album
          </Link>
          {album.artist_spotify_id && (
            <Link
              className={styles.actionBtn}
              to={`/artists/${album.artist_spotify_id}`}
              onClick={stop}
            >
              Artist
            </Link>
          )}
        </span>
      </span>
    </div>
  );
}
