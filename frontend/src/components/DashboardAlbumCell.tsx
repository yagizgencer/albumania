import type { DashboardAlbum } from "../api/dashboard";
import styles from "./DashboardAlbumCell.module.css";

// Presentational only: the whole table row is the click target (it navigates to
// the dashboard album page), so nothing in here is independently clickable.
export function DashboardAlbumCell({ album }: { album: DashboardAlbum }) {
  return (
    <div className={styles.cell}>
      {album.album_art_url && (
        <img src={album.album_art_url} alt="" className={styles.art} />
      )}
      <span className={styles.text}>
        <strong className={styles.title}>{album.title}</strong>
        <small className={styles.artist}>{album.artist}</small>
      </span>
    </div>
  );
}
