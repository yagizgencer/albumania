import styles from "./Alert.module.css";

type AlertVariant = "error" | "info" | "success";

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  /** Optional action rendered on the right (e.g. a "Resend" button). */
  action?: React.ReactNode;
}

/** Neat, consistent banner for surfacing errors and notices to the user. */
export function Alert({ variant = "error", children, action }: AlertProps) {
  return (
    <div className={`${styles.alert} ${styles[variant]}`} role="alert">
      <span className={styles.message}>{children}</span>
      {action && <span className={styles.action}>{action}</span>}
    </div>
  );
}
