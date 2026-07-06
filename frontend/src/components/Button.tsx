import { Link, type LinkProps } from "react-router-dom";
import styles from "./Button.module.css";

type Intent = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md";

const INTENT_CLASS: Record<Intent, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
  success: styles.success,
  ghost: styles.ghost,
};

function classes(intent: Intent, size: Size, block: boolean, extra?: string): string {
  return [
    styles.btn,
    INTENT_CLASS[intent],
    size === "sm" ? styles.sm : styles.md,
    block ? styles.block : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: Intent;
  size?: Size;
  block?: boolean;
};

/** Standard button — the app's four intents in two sizes, on the sketch tokens. */
export function Button({
  intent = "primary",
  size = "md",
  block = false,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={classes(intent, size, block, className)} {...rest} />
  );
}

type ButtonLinkProps = LinkProps & {
  intent?: Intent;
  size?: Size;
  block?: boolean;
};

/** A React Router <Link> styled exactly like a Button (for navigation actions). */
export function ButtonLink({
  intent = "primary",
  size = "md",
  block = false,
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={classes(intent, size, block, className)} {...rest} />;
}
