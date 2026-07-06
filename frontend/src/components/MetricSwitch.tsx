import { Tabs, type TabOption } from "./Tabs";
import styles from "./MetricSwitch.module.css";

interface MetricSwitchProps<T extends string> {
  label: string;
  options: [TabOption<T>, TabOption<T>];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A labelled two-state segmented control (e.g. Similarity ↔ Rating on the
 * dashboards). Both options are always visible; the active one fills with the
 * selection color. Built on the shared rectangular Tabs.
 */
export function MetricSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
}: MetricSwitchProps<T>) {
  return (
    <div className={styles.group}>
      <span className={styles.label}>{label}</span>
      <Tabs options={options} value={value} onChange={onChange} ariaLabel={label} />
    </div>
  );
}
