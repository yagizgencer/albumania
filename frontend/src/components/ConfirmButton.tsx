import { useState } from "react";
import { Button } from "./Button";
import styles from "./ConfirmButton.module.css";

type Intent = "primary" | "secondary" | "danger" | "success";

interface ConfirmButtonProps {
  /** The resting button's label (e.g. "Unfriend"). */
  label: React.ReactNode;
  /** Prompt shown inline once the button is clicked (e.g. "Unfriend alice?"). */
  prompt: string;
  /** Label on the button that actually performs the action. */
  confirmLabel: string;
  /** The action to run when confirmed. */
  onConfirm: () => void | Promise<void>;
  /** Intent of the resting trigger button. */
  intent?: Intent;
  /** Intent of the confirm button (defaults to danger — this is a destructive gate). */
  confirmIntent?: Intent;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
}

/**
 * A button that guards a destructive action with an inline confirmation, mirroring
 * the "Remove this rating?" pattern on the album/rating pages. First click swaps
 * the button for a "<prompt> [confirm] [cancel]" row; no browser confirm() dialog.
 */
export function ConfirmButton({
  label,
  prompt,
  confirmLabel,
  onConfirm,
  intent = "danger",
  confirmIntent = "danger",
  size = "sm",
  disabled = false,
  title,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      // Leave `confirming` true: the row this button lives in usually unmounts on
      // success. If it doesn't, resetting here would flash the trigger back.
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        intent={intent}
        size={size}
        onClick={() => setConfirming(true)}
        disabled={disabled}
        title={title}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className={styles.confirm}>
      <span className={styles.prompt}>{prompt}</span>
      <Button intent={confirmIntent} size={size} onClick={handleConfirm} disabled={busy}>
        {busy ? "Working…" : confirmLabel}
      </Button>
      <Button
        intent="secondary"
        size={size}
        onClick={() => setConfirming(false)}
        disabled={busy}
      >
        Cancel
      </Button>
    </span>
  );
}
