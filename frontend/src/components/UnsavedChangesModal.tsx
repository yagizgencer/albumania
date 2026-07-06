import { useState } from "react";
import type { useUnsavedNavigationGuard } from "../lib/unsavedChanges";
import styles from "./UnsavedChangesModal.module.css";

type Guard = ReturnType<typeof useUnsavedNavigationGuard>;

/**
 * Confirmation shown when the user tries to navigate away with unsaved changes.
 * Save & quit saves every dirty editor on the page then leaves; Quit without
 * saving leaves and discards; Cancel stays.
 */
export function UnsavedChangesModal({ blocker, saveAll }: Guard) {
  const [saving, setSaving] = useState(false);

  if (blocker.state !== "blocked") return null;

  async function handleSaveAndQuit() {
    setSaving(true);
    try {
      await saveAll();
      blocker.proceed?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Unsaved changes">
      <div className={styles.modal}>
        <h2 className={styles.title}>Unsaved changes</h2>
        <p className={styles.text}>
          You have unsaved changes. What would you like to do?
        </p>
        <div className={styles.actions}>
          <button
            className={`${styles.btn} ${styles.save}`}
            onClick={handleSaveAndQuit}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save & quit"}
          </button>
          <button
            className={`${styles.btn} ${styles.quit}`}
            onClick={() => blocker.proceed?.()}
            disabled={saving}
          >
            Quit without saving
          </button>
          <button
            className={`${styles.btn} ${styles.cancel}`}
            onClick={() => blocker.reset?.()}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
