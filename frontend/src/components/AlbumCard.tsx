import { Link } from "react-router-dom";
import type { AlbumStatus } from "../api/artists";
import { CheckIcon, HeadphonesIcon, PlusIcon } from "./Icons";
import styles from "./AlbumCard.module.css";

interface AlbumCardProps {
  spotifyId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  meanScore: number | null;
  numRaters: number;
  status: AlbumStatus;
}

const BADGE: Record<
  AlbumStatus,
  { className: string; label: string; icon: typeof CheckIcon }
> = {
  none: { className: styles.badgeNone, label: "Not in your library", icon: PlusIcon },
  draft: { className: styles.badgeDraft, label: "In Listen Later", icon: HeadphonesIcon },
  published: { className: styles.badgePublished, label: "Rated", icon: CheckIcon },
};

export function AlbumCard({
  spotifyId,
  title,
  artist,
  albumArtUrl,
  meanScore,
  numRaters,
  status,
}: AlbumCardProps) {
  const badge = BADGE[status];
  const BadgeIcon = badge.icon;
  const rating =
    numRaters === 0 || meanScore === null
      ? "—"
      : `${meanScore.toFixed(1)} (${numRaters})`;

  return (
    <Link to={`/albums/${spotifyId}`} className={styles.card}>
      <div className={styles.artWrap}>
        {albumArtUrl ? (
          <img src={albumArtUrl} alt="" className={styles.art} />
        ) : (
          <div className={styles.artPlaceholder} aria-hidden />
        )}
        <span
          className={`${styles.badge} ${badge.className}`}
          title={badge.label}
          aria-label={badge.label}
        >
          <BadgeIcon size={16} />
        </span>
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.artist}>{artist}</div>
      <div className={styles.footer}>
        <span className={styles.rating}>{rating}</span>
      </div>
    </Link>
  );
}
