import { useState } from "react";
import { Link } from "react-router-dom";
import { createRating } from "../api/ratings";
import { getAlbum } from "../api/albums";
import type { AlbumStatus } from "../api/artists";
import { isRateable, RATEABLE_RULE_TEXT } from "../lib/albumRules";
import { CheckIcon, HeadphonesIcon, PlusIcon } from "./Icons";
import { ScoreMeter } from "./ScoreMeter";
import styles from "./AlbumCard.module.css";

interface AlbumCardProps {
  spotifyId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  totalSongs: number;
  meanScore: number | null;
  numRaters: number;
  status: AlbumStatus;
}

const STATIC_BADGE: Record<
  "draft" | "published",
  { className: string; label: string; icon: typeof CheckIcon }
> = {
  draft: { className: styles.badgeDraft, label: "In Listen Later", icon: HeadphonesIcon },
  published: { className: styles.badgePublished, label: "Rated", icon: CheckIcon },
};

export function AlbumCard({
  spotifyId,
  title,
  artist,
  albumArtUrl,
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
              aria-label="Add to Listen Later"
              aria-busy={adding}
              title="Add to Listen Later"
              onClick={handleAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleAdd(e);
              }}
            >
              <PlusIcon size={16} />
            </span>
          ) : (
            <span
              className={`${styles.badge} ${styles.badgeDisabled}`}
              aria-label={RATEABLE_RULE_TEXT}
              title={RATEABLE_RULE_TEXT}
            >
              <PlusIcon size={16} />
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
              return <Icon size={16} />;
            })()}
          </span>
        )}
      </div>
      <div className={styles.title}>{title}</div>
      <div className={styles.artist}>{artist}</div>
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
