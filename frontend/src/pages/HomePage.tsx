import { Link } from "react-router-dom";
import { getTrendingAlbums, getTrendingArtists } from "../api/home";
import { useAuth } from "../context/AuthContext";
import { ActivityFeed } from "../components/ActivityFeed";
import { TrendingAlbumRow, TrendingArtistRow, TrendingBox } from "../components/TrendingBox";
import SketchUnderline from "../components/SketchUnderline";
import { LoadingState } from "../components/Spinner";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { username, profile, isLoading } = useAuth();

  if (isLoading) return <main className={styles.page}><LoadingState /></main>;
  if (!username) return <PublicLanding />;
  return <LoggedInHome displayName={profile?.display_name ?? username} />;
}

// ---------------------------------------------------------------------------
// Public landing — shown to logged-out visitors
// ---------------------------------------------------------------------------

function PublicLanding() {
  return (
    <main className={styles.landing}>
      <img
        src="/albumania_icon.png"
        alt=""
        className={styles.landingLogo}
        aria-hidden
      />
      <h1 className={styles.landingHero}>Albumania</h1>
      <div className={styles.heroUnderline}>
        <SketchUnderline strokeWidth={3} />
      </div>
      <p className={styles.landingTagline}>
        Rate albums, pick your top 5 tracks, and see how your taste lines up
        with friends and Spotify's most-popular.
      </p>

      <ul className={styles.landingBullets}>
        <li className={styles.landingBullet}>
          <h3>Score every album</h3>
          <p>Rate 0–10, rank your top 5, and jot notes per track.</p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Compare with friends</h3>
          <p>See how closely your rankings match — per album and overall.</p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Listen Later, together</h3>
          <p>Invite friends to an album and discover it side-by-side.</p>
        </li>
      </ul>

      <div className={styles.landingCtas}>
        <Link to="/login" className={styles.ctaPrimary}>Log in</Link>
        <Link to="/register" className={styles.ctaSecondary}>Sign up</Link>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Logged-in home — welcome + activity timeline + trending
// ---------------------------------------------------------------------------

function LoggedInHome({ displayName }: { displayName: string }) {
  return (
    <main className={styles.page}>
      <section className={styles.welcome}>
        <h1>Welcome back, {displayName}.</h1>
        <div className={styles.welcomeUnderline}>
          <SketchUnderline color="#8a78dd" />
        </div>
        <p>What did you listen to today?</p>
      </section>

      <div className={styles.content}>
        <section className={styles.feedCol}>
          <h2 className={styles.colHeading}>Recent activity</h2>
          <div className={styles.feedCard}>
            <ActivityFeed />
          </div>
        </section>

        <aside className={styles.sideCol}>
          <TrendingBox
            title="Trending Albums"
            fetchItems={getTrendingAlbums}
            keyOf={(a) => a.spotify_id}
            renderRow={(a) => <TrendingAlbumRow album={a} />}
          />
          <TrendingBox
            title="Trending Artists"
            fetchItems={getTrendingArtists}
            keyOf={(a) => a.artist_spotify_id}
            renderRow={(a) => <TrendingArtistRow artist={a} />}
          />
        </aside>
      </div>
    </main>
  );
}

