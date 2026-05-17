import { useState } from "react";
import styles from "./Avatar.module.css";

interface AvatarProps {
  username: string;
  pictureUrl: string | null;
  size?: number;
  displayName?: string | null;
  className?: string;
}

export function Avatar({
  username,
  pictureUrl,
  size = 32,
  displayName,
  className,
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = (displayName ?? username).slice(0, 1).toUpperCase() || "?";
  const showImage = pictureUrl && !failed;

  return (
    <span
      className={`${styles.wrap} ${className ?? ""}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
      }}
      aria-label={username}
    >
      {showImage ? (
        <img
          className={styles.img}
          src={pictureUrl}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
