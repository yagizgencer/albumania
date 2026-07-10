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
   * "pill" — a clean rounded segmented control (soft container, teal active
   * pill, no hard offset shadow) — for dashboard metric/view toggles.
   */
  variant?: "solid" | "subtle" | "pill";
  /** Accessible group label. */
  ariaLabel?: string;
  className?: string;
}

const CONTAINER = {
  solid: styles.tabs,
  subtle: styles.tabsSubtle,
  pill: styles.tabsPill,
} as const;
const CELL = {
  solid: styles.tab,
  subtle: styles.tabSubtle,
  pill: styles.tabPill,
} as const;
const ACTIVE = {
  solid: styles.active,
  subtle: styles.activeSubtle,
  pill: styles.activePill,
} as const;

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
  return (
    <div
      className={[CONTAINER[variant], block ? styles.block : "", className ?? ""]
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
            className={`${CELL[variant]} ${active ? ACTIVE[variant] : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
