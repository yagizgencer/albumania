import { useEffect, useState } from "react";
import styles from "./ImageLightbox.module.css";

/**
 * A thumbnail image that expands to a full-screen view when clicked — like
 * tapping a profile photo. Used for album covers and artist photos (which used
 * to be Spotify links). Closes on backdrop click or Escape.
 */
export function ImageLightbox({
  src,
  alt,
  thumbClassName,
}: {
  src: string;
  alt: string;
  /** Class controlling the thumbnail's size/shape (the page owns those). */
  thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`${styles.thumbButton} ${thumbClassName ?? ""}`.trim()}
        onClick={() => setOpen(true)}
        aria-label={`View ${alt || "image"} larger`}
      >
        <img src={src} alt={alt} className={styles.thumbImg} />
      </button>

      {open && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Expanded image"}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          {/* Stop the image itself from closing the overlay when clicked. */}
          <img
            src={src}
            alt={alt}
            className={styles.fullImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
