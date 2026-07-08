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
        <div className={styles.landingCtas}>
          <ButtonLink to="/register" intent="primary">Get started</ButtonLink>
          <ButtonLink to="/login" intent="secondary">Log in</ButtonLink>
        </div>

        <ul className={styles.landingBullets}>
        <li className={styles.landingBullet}>
          <h3>Discover &amp; Rate</h3>
          <p>
            Explore new albums, rate them, and highlight your favorite tracks. Log your journey in a personalized dashboard.
          </p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Listen together</h3>
          <p>
            Check out your friends' recent activity. Invite them to listen to an album, and find out how they like it.
          </p>
        </li>
        <li className={styles.landingBullet}>
          <h3>Compare your taste</h3>
          <p>
            See how your taste lines up with your friends and the current trend on Spotify. Visualize your ratings and similarity scores as interactive graphs.
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
      <header className={styles.welcome}>
        <h1 className={styles.welcomeTitle}>
          Welcome back, <span className={styles.welcomeName}>{displayName}</span>
        </h1>
        <div className={styles.welcomeUnderline}>
          <SketchUnderline color="var(--accent)" />
        </div>
      </header>

      <div className={styles.content}>
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

        <section className={styles.feedCol}>
          <ActivityFeed />
        </section>
      </div>
    </main>
  );
}

