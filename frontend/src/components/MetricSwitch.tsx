import styles from "../pages/ProfileDashboardPage.module.css";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface MetricSwitchProps<T extends string> {
  label: string;
  options: [Option<T>, Option<T>];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A two-state flip switch: both labels are always visible with the active side
 * highlighted, and a single click flips to the other option. Used for the
 * Similarity ↔ Rating metric on the dashboards.
 */
export function MetricSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: MetricSwitchProps<T>) {
  const [first, second] = options;
  const flip = () => onChange(value === first.value ? second.value : first.value);

  return (
    <div className={styles.toggleGroup}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        type="button"
        className={styles.switch}
        role="switch"
        aria-checked={value === second.value}
        onClick={flip}
      >
        {options.map((opt) => (
          <span
            key={opt.value}
            className={`${styles.switchOption} ${
              value === opt.value ? styles.switchActive : ""
            }`}
          >
            {opt.label}
          </span>
        ))}
      </button>
    </div>
  );
}
