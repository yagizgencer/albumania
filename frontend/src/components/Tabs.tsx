import styles from "./Tabs.module.css";

export interface TabOption<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch the bar to fill its container, cells sharing the width equally. */
  block?: boolean;
  /**
   * "solid" (default) — bordered segmented bar with a filled active cell.
   * "subtle" — compact, borderless text toggle (for tight headers like the
   * trending boxes); the active item gets a soft pill, no chunky border.
   */
  variant?: "solid" | "subtle";
  /** Accessible group label. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Rectangular segmented control (tabs / toggle). The active cell fills with the
 * selection color; hover on an inactive cell is a faint tint only. Use for
 * time-period tabs, metric toggles, and any small "pick one" control.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  block = false,
  variant = "solid",
  ariaLabel,
  className,
}: TabsProps<T>) {
  const subtle = variant === "subtle";
  return (
    <div
      className={[
        subtle ? styles.tabsSubtle : styles.tabs,
        block ? styles.block : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            className={`${subtle ? styles.tabSubtle : styles.tab} ${
              active ? (subtle ? styles.activeSubtle : styles.active) : ""
            }`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
