import styles from "./ScoreMeter.module.css";

interface ScoreMeterProps {
  /** Score on a 0–10 scale. */
  score: number;
  /** Number of raters; omit to hide the "(n)" count (e.g. for "your score"). */
  count?: number;
}

// Renders a rating score as "9.4/10", where the "/10" is smaller and lighter so
// the score reads as the focus. An optional "(n)" shows the rater count for means.
export function ScoreMeter({ score, count }: ScoreMeterProps) {
  return (
    <span className={styles.meter}>
      <span className={styles.value}>{score.toFixed(1)}</span>
      <span className={styles.outOf}>/10</span>
      {count != null && <span className={styles.count}>({count})</span>}
    </span>
  );
}
