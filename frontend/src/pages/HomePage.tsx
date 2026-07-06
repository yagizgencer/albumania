import { getTrendingAlbums, getTrendingArtists } from "../api/home";
import { useAuth } from "../context/AuthContext";
import { ActivityFeed } from "../components/ActivityFeed";
import { ButtonLink } from "../components/Button";
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
      <div className={styles.landingInner}>
        <img
          src="/albumania_icon.png"
          alt=""
          className={styles.landingLogo}
          aria-hidden
        />
        <h1 className={styles.landingHero}>Albumania</h1>
        <p className={styles.landingTagline}>
          Score albums out of 10, rank your top 5 tracks, and see exactly how your
          taste lines up with your friends — and with the crowd on Spotify.
        </p>
        <div className={styles.landingCtas}>
          <ButtonLink to="/register" intent="primary">Get started</ButtonLink>
          <ButtonLink to="/login" intent="secondary">Log in</ButtonLink>
        </div>

        <ul className={styles.landingBullets}>
        <li className={styles.landingBullet}>
          <h3>Rate &amp; rank</h3>
          <p>
            Give every album a score, pick your top 5 tracks, and jot notes on the
            songs that stuck with you.
          </p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Compare your taste</h3>
          <p>
            Your dashboard charts how closely you agree with friends and Spotify's
            most-played — track by track.
          </p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Listen together</h3>
          <p>
            Invite a friend to an album, rate it side by side, and unlock a shared
            comparison once you both finish.
          </p>
        </li>
        </ul>
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
          <SketchUnderline color="var(--accent)" />
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
            fill
          />
          <TrendingBox
            title="Trending Artists"
            fetchItems={getTrendingArtists}
            keyOf={(a) => a.artist_spotify_id}
            renderRow={(a) => <TrendingArtistRow artist={a} />}
            fill
          />
        </aside>
      </div>
    </main>
  );
}

