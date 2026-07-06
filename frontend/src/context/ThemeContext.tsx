import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { applyChartTheme } from "../lib/chartTheme";

/** What the user picked. "system" tracks the OS live via prefers-color-scheme. */
export type ThemePreference = "system" | "light" | "dark";
/** The resolved value actually applied to <html data-theme>. */
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "albumania-theme";

interface ThemeContextValue {
  /** The resolved light/dark actually in effect. */
  theme: ResolvedTheme;
  /** The user's choice (system/light/dark). */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // storage unavailable — fall through to system
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

/** Reflect the resolved theme onto <html> and the theme-color meta, then re-theme
 *  charts (their Chart.js defaults read CSS vars we just changed). */
function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    // Use the resolved paper color so the mobile browser chrome matches.
    const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
    if (paper) meta.setAttribute("content", paper);
  }
  applyChartTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readStoredPreference()));

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // non-fatal
    }
  }, []);

  // Apply whenever preference changes.
  useEffect(() => {
    const resolved = resolve(preference);
    setTheme(resolved);
    applyResolvedTheme(resolved);
  }, [preference]);

  // While on "system", follow live OS changes.
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolve("system");
      setTheme(resolved);
      applyResolvedTheme(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const value = useMemo(
    () => ({ theme, preference, setPreference }),
    [theme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
