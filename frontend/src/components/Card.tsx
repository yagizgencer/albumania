import styles from "./Card.module.css";

/**
 * Shared surface card — paper surface, 2px inked border, rounded corners and an
 * offset shadow. Use for list rows and small panels so they all match.
 */
export function Card({
  children,
  pad = "md",
  muted = false,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  pad?: "sm" | "md";
  muted?: boolean;
}) {
  return (
    <div
      className={[
        styles.card,
        pad === "sm" ? styles.padSm : "",
        muted ? styles.muted : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
