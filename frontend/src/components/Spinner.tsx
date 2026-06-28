import styles from "./Spinner.module.css";

interface LoadingStateProps {
  /** Text shown next to the spinner. */
  label?: string;
}

/** Consistent loading indicator used in place of bare "Loading…" text. */
export function LoadingState({ label = "Loading…" }: LoadingStateProps) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
