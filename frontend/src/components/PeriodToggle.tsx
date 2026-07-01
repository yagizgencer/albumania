import type { TrendingPeriod } from "../api/home";
import styles from "./PeriodToggle.module.css";

const OPTIONS: { value: TrendingPeriod; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

interface PeriodToggleProps {
  value: TrendingPeriod;
  onChange: (value: TrendingPeriod) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className={styles.segmented} role="group" aria-label="Time period">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${styles.seg} ${value === o.value ? styles.segActive : ""}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
