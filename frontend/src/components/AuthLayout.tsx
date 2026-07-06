import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

/**
 * Two-panel auth layout: a warm brand hero on the left, the form card on the
 * right. Collapses to a single centered card on narrow screens. Wraps every
 * auth page (login / register / forgot / reset / verify) so they share one look.
 */
export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.wrap}>
      <aside className={styles.hero} aria-hidden>
        <div className={styles.heroBrand}>
          <img src="/albumania_icon.png" alt="" className={styles.heroLogo} />
          <span className={styles.heroWordmark}>Albumania</span>
        </div>
        <div>
          <h2 className={styles.heroTitle}>Your music taste, mapped.</h2>
          <p className={styles.heroTagline}>
            Rate albums, rank your top 5, and see how closely your taste lines up
            with friends and Spotify.
          </p>
        </div>
      </aside>

      <div className={styles.formSide}>
        <div className={styles.card}>
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
