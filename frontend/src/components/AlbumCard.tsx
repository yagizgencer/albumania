import { useState } from "react";
import { Link } from "react-router-dom";
import { createRating } from "../api/ratings";
import { getAlbum } from "../api/albums";
import type { AlbumStatus } from "../api/artists";
import { isRateable, RATEABLE_RULE_TEXT } from "../lib/albumRules";
import { formatDate } from "../lib/date";
import { CheckIcon, DiscIcon, HeadphonesIcon, PlusIcon } from "./Icons";
import { ScoreMeter } from "./ScoreMeter";
import styles from "./AlbumCard.module.css";

interface AlbumCardProps {
  spotifyId: string;
  title: string;
  albumArtUrl: string | null;
  releaseDate: string;
  totalSongs: number;
  meanScore: number | null;
  numRaters: number;
  status: AlbumStatus;
}

const STATIC_BADGE: Record<
  "draft" | "published",
  { className: string; label: string; icon: typeof CheckIcon }
> = {
  draft: { className: styles.badgeDraft, label: "In Listen & Rate", icon: HeadphonesIcon },
  published: { className: styles.badgePublished, label: "Rated", icon: CheckIcon },
};

export function AlbumCard({
  spotifyId,
  title,
  albumArtUrl,
  releaseDate,
  totalSongs,
  meanScore,
  numRaters,
  status,
}: AlbumCardProps) {
  const [currentStatus, setCurrentStatus] = useState<AlbumStatus>(status);
  const [adding, setAdding] = useState(false);
  const rateable = isRateable(totalSongs);

  async function handleAdd(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (adding || !rateable || currentStatus !== "none") return;
    setAdding(true);
    try {
      // Make sure the album exists in our DB (gives us its id), then add a draft.
      const album = await getAlbum(spotifyId);
      await createRating(album.id);
      setCurrentStatus("draft");
    } catch {
      // Leave the badge as-is; the user can retry.
    } finally {
      setAdding(false);
    }
  }

  return (
    <Link to={`/albums/${spotifyId}`} className={styles.card}>
      <div className={styles.artWrap}>
        {albumArtUrl ? (
          <img src={albumArtUrl} alt="" className={styles.art} />
        ) : (
          <div className={styles.artPlaceholder} aria-hidden />
        )}
        {currentStatus === "none" ? (
          rateable ? (
            <span
              className={`${styles.badge} ${styles.badgeNone} ${styles.badgeBtn}`}
              role="button"
              tabIndex={0}
              aria-label="Add to Listen & Rate"
              aria-busy={adding}
              title="Add to Listen & Rate"
              onClick={handleAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleAdd(e);
              }}
            >
              <PlusIcon size={19} />
            </span>
          ) : (
            <span
              className={`${styles.badge} ${styles.badgeDisabled}`}
              aria-label={RATEABLE_RULE_TEXT}
              title={RATEABLE_RULE_TEXT}
            >
              <PlusIcon size={19} />
            </span>
          )
        ) : (
          <span
            className={`${styles.badge} ${STATIC_BADGE[currentStatus].className}`}
            title={STATIC_BADGE[currentStatus].label}
            aria-label={STATIC_BADGE[currentStatus].label}
          >
            {(() => {
              const Icon = STATIC_BADGE[currentStatus].icon;
              return <Icon size={19} />;
            })()}
          </span>
        )}
      </div>
      <div className={styles.title} title={title}>
        {title}
      </div>
      <div className={styles.meta}>
        <span className={styles.metaChip}>
          <DiscIcon size={13} className={styles.metaChipIcon} />
          <span className={styles.metaChipText}>{formatDate(releaseDate)}</span>
        </span>
      </div>
      <div className={styles.footer}>
        {numRaters === 0 || meanScore === null ? (
          <span className={styles.rating}>—</span>
        ) : (
          <ScoreMeter score={meanScore} count={numRaters} />
        )}
      </div>
    </Link>
  );
}
