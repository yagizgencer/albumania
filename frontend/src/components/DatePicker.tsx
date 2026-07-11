import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon } from "./Icons";
import styles from "./DatePicker.module.css";

/* Purpose-drawn ‹ / › chevrons whose path is centred in the 24×24 box (x + y
   both span 6→18, centre 12) — so they sit dead-centre in the nav buttons.
   Rotating the shared down-chevron left visible off-centring. */
function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface DatePickerProps {
  /** Selected date as an ISO "YYYY-MM-DD" string, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible label for the field. */
  ariaLabel?: string;
  /** Earliest selectable date (ISO "YYYY-MM-DD"), inclusive. */
  min?: string;
  /** Latest selectable date (ISO "YYYY-MM-DD"), inclusive. */
  max?: string;
  id?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** ISO "YYYY-MM-DD" → Date at local midnight, or null. */
function parseIso(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date → ISO "YYYY-MM-DD" (local). */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Date → the app's display format, "DD.MM.YYYY". */
function toDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}.${m}.${date.getFullYear()}`;
}

/**
 * Parse the user's typed text into a Date. Accepts "DD.MM.YYYY" and is lenient
 * about the separator (. / -) and single-digit day/month, e.g. "5/3/2026".
 * Returns null if it isn't a real calendar date.
 */
function parseTyped(text: string): Date | null {
  const parts = text.trim().split(/[./-]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy || yyyy < 1000) return null;
  const date = new Date(yyyy, mm - 1, dd);
  // Reject overflow (e.g. 31.02) — JS rolls it over, so check the round-trip.
  if (
    date.getFullYear() !== yyyy ||
    date.getMonth() !== mm - 1 ||
    date.getDate() !== dd
  ) {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Clamp a date into [min, max] (either bound may be absent). */
function clamp(date: Date, min: Date | null, max: Date | null): Date {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/**
 * A cozy, writable calendar date picker matching the app's custom controls: a
 * text field you can type "DD.MM.YYYY" into, with a calendar button that opens
 * our own themed popover (no native <input type="date">, so it looks identical
 * in light + dark). Month and year are quick-select dropdowns. Respects optional
 * min/max bounds — out-of-range days are disabled and typed dates are rejected.
 */
export function DatePicker({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  id,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseIso(value), [value]);
  const minDate = useMemo(() => parseIso(min ?? ""), [min]);
  const maxDate = useMemo(() => parseIso(max ?? ""), [max]);

  // The month currently shown in the grid.
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  // The text in the field. Kept in sync with `value` unless the user is editing.
  const [text, setText] = useState(() => (selected ? toDisplay(selected) : ""));
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reflect external value changes into the field (unless focused/typing).
  useEffect(() => {
    setText(selected ? toDisplay(selected) : "");
  }, [selected]);

  // When opening, jump the grid to the selection (clamped into range) or today.
  useEffect(() => {
    if (open) {
      const base = selected ?? clamp(new Date(), minDate, maxDate);
      setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    }
  }, [open, selected, minDate, maxDate]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  function outOfRange(date: Date): boolean {
    return Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
  }

  // Build the grid: leading blanks (Mon-first) + this month's days.
  const grid = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  // Year dropdown span: a generous window that always includes the currently
  // viewed year (arrow navigation is unbounded, so the select must have an
  // option for whatever month/year the user browses to).
  const years = useMemo(() => {
    const nowY = new Date().getFullYear();
    const viewY = viewMonth.getFullYear();
    const start = Math.min(minDate ? minDate.getFullYear() : nowY - 60, viewY);
    const end = Math.max(maxDate ? maxDate.getFullYear() : nowY + 5, viewY);
    const list: number[] = [];
    for (let y = end; y >= start; y--) list.push(y);
    return list;
  }, [minDate, maxDate, viewMonth]);

  // Month navigation is always available — browsing to a month is fine, the
  // range constraint only limits which individual DAYS can be picked.
  function stepMonth(delta: number) {
    setViewMonth((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function pick(date: Date) {
    if (outOfRange(date)) return;
    onChange(toIso(date));
    setOpen(false);
  }

  // Commit whatever is typed: parse, validate against range, then apply or revert.
  function commitTyped() {
    const trimmed = text.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    const parsed = parseTyped(trimmed);
    if (parsed && !outOfRange(parsed)) {
      onChange(toIso(parsed));
    } else {
      // Invalid or out-of-range → revert to the last good value.
      setText(selected ? toDisplay(selected) : "");
    }
  }

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
    >
      <div className={`${styles.field} ${open ? styles.fieldOpen : ""}`}>
        <input
          type="text"
          id={id}
          className={styles.input}
          value={text}
          placeholder="DD.MM.YYYY"
          aria-label={ariaLabel}
          inputMode="numeric"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className={styles.calBtn}
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarIcon size={16} className={styles.icon} />
        </button>
      </div>

      {open && (
        <div className={styles.pop} role="dialog" aria-label="Choose a date">
          <div className={styles.calTop}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className={styles.navIcon} />
            </button>

            <div className={styles.selects}>
              <select
                className={styles.monthSelect}
                aria-label="Month"
                value={viewMonth.getMonth()}
                onChange={(e) =>
                  setViewMonth(
                    (v) => new Date(v.getFullYear(), Number(e.target.value), 1),
                  )
                }
              >
                {MONTHS.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={styles.yearSelect}
                aria-label="Year"
                value={viewMonth.getFullYear()}
                onChange={(e) =>
                  setViewMonth(
                    (v) => new Date(Number(e.target.value), v.getMonth(), 1),
                  )
                }
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={styles.navBtn}
              onClick={() => stepMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className={styles.navIcon} />
            </button>
          </div>

          <div className={styles.dow} aria-hidden>
            {DOW.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className={styles.days}>
            {grid.map((date, i) =>
              date ? (
                <button
                  type="button"
                  key={toIso(date)}
                  disabled={outOfRange(date)}
                  className={[
                    styles.day,
                    selected && sameDay(date, selected) ? styles.selected : "",
                    sameDay(date, today) ? styles.today : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => pick(date)}
                >
                  {date.getDate()}
                </button>
              ) : (
                <span key={`blank-${i}`} className={styles.blank} aria-hidden />
              ),
            )}
          </div>

          <div className={styles.foot}>
            <button
              type="button"
              className={styles.footLink}
              disabled={outOfRange(today)}
              onClick={() => pick(today)}
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                className={styles.footClear}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
