import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { TrendingAlbum, TrendingArtist, TrendingPeriod } from "../api/home";
import { Avatar } from "./Avatar";
import { ScoreMeter } from "./ScoreMeter";
import { PeriodToggle } from "./PeriodToggle";
import { Alert } from "./Alert";
import { LoadingState } from "./Spinner";
import styles from "./TrendingBox.module.css";

interface TrendingBoxProps<T> {
  title: string;
  fetchItems: (period: TrendingPeriod) => Promise<T[]>;
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  defaultPeriod?: TrendingPeriod;
  /** When set, the box fills its parent's height and scrolls its list within,
      instead of using its own fixed max-height. Used in the sticky home rail. */
  fill?: boolean;
}

export function TrendingBox<T>({
  title,
  fetchItems,
  keyOf,
  renderRow,
  defaultPeriod = "all",
  fill = false,
}: TrendingBoxProps<T>) {
  const [period, setPeriod] = useState<TrendingPeriod>(defaultPeriod);
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetchItems(period)
      .then((data) => !cancelled && setItems(data))
      .catch(() => !cancelled && setError("Couldn't load this list."));
    return () => {
      cancelled = true;
    };
  }, [period, fetchItems]);

  return (
    <section className={`${styles.section} ${fill ? styles.fill : ""}`}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {error ? (
        <Alert>{error}</Alert>
      ) : items === null ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <p className={styles.empty}>Nothing here for this period yet.</p>
      ) : (
        // Compact: ~5 rows tall; the rest (up to 20) scroll within the box.
        <div className={styles.list}>
          {items.map((it) => (
            <div key={keyOf(it)}>{renderRow(it)}</div>
          ))}
        </div>
      )}
    </section>
  );
}

export function TrendingAlbumRow({ album }: { album: TrendingAlbum }) {
  return (
    <Link to={`/albums/${album.spotify_id}`} className={styles.row}>
      <span className={styles.rank}>{album.rank}</span>
      {album.album_art_url ? (
        <img src={album.album_art_url} alt="" className={styles.art} />
      ) : (
        <span className={styles.artPlaceholder} aria-hidden />
      )}
      <span className={styles.info}>
        <span className={styles.rowTitle}>{album.title}</span>
        <span className={styles.rowSub}>{album.artist}</span>
      </span>
      <span className={styles.meta}>
        {album.num_raters > 0 && album.mean_score !== null ? (
          <ScoreMeter score={album.mean_score} count={album.num_raters} />
        ) : (
          <span className={styles.dash}>—</span>
        )}
        <span className={styles.count}>{album.rating_count} rated</span>
      </span>
    </Link>
  );
}

export function TrendingArtistRow({ artist }: { artist: TrendingArtist }) {
  return (
    <Link to={`/artists/${artist.artist_spotify_id}`} className={styles.row}>
      <span className={styles.rank}>{artist.rank}</span>
      <Avatar
        username={artist.name}
        pictureUrl={artist.image_url}
        displayName={artist.name}
        size={40}
        className={styles.avatar}
      />
      <span className={styles.info}>
        <span className={styles.rowTitle}>{artist.name}</span>
      </span>
      <span className={styles.meta}>
        <span className={styles.count}>{artist.rating_count} rated</span>
      </span>
    </Link>
  );
}
