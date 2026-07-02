import styles from "./PageContainer.module.css";

type Width = "default" | "narrow" | "wide";

/**
 * Shared page wrapper — renders a <main> with one of a small set of content
 * widths so every page aligns to the same left/right edges and gets the same
 * responsive side padding. Use `width="wide"` for data-heavy dashboards and
 * `width="narrow"` for simple single-column pages.
 */
export function PageContainer({
  children,
  width = "default",
  className,
}: {
  children: React.ReactNode;
  width?: Width;
  className?: string;
}) {
  const widthClass =
    width === "wide" ? styles.wide : width === "narrow" ? styles.narrow : styles.default;
  return (
    <main className={`${styles.container} ${widthClass} ${className ?? ""}`}>
      {children}
    </main>
  );
}
