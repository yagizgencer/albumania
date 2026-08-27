import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useFeatures } from "../context/FeaturesContext";
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
  // Don't promise a comparison the backend has switched off.
  const { spotifyComparison } = useFeatures();

  return (
    <main className={styles.wrap}>
      <aside className={styles.hero}>
        <Link to="/" className={styles.heroBrand} aria-label="Albumania home">
          <img src="/albumania_icon.png" alt="" className={styles.heroLogo} />
          <span className={styles.heroWordmark}>Albumania</span>
        </Link>
        <div>
          <h2 className={styles.heroTitle}>Discover, listen, compare.</h2>
          <p className={styles.heroTagline}>
            {spotifyComparison
              ? "Rate new albums, listen along with friends, and see how your taste lines up with theirs and the current trend on Spotify."
              : "Rate new albums, listen along with friends, and see how your taste lines up with theirs."}
          </p>
        </div>
      </aside>

      <div className={styles.formSide}>
        <div className={styles.card}>
          {/* Below the hero breakpoint the gradient panel is hidden, which left
              the auth pages with no branding at all — this compact row stands in
              for it and is hidden again once the hero is back. */}
          <Link to="/" className={styles.compactBrand} aria-label="Albumania home">
            <img src="/albumania_icon.png" alt="" className={styles.compactLogo} />
            <span className={styles.compactWordmark}>Albumania</span>
          </Link>
          <h1>{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
