import { useState } from "react";
import { getTrendingAlbums, getTrendingArtists } from "../api/home";
import { useAuth } from "../context/AuthContext";
import { useFeatures } from "../context/FeaturesContext";
import { ActivityFeed } from "../components/ActivityFeed";
import { ButtonLink } from "../components/Button";
import { Tabs, type TabOption } from "../components/Tabs";
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
  // Don't promise a comparison the backend has switched off.
  const { spotifyComparison } = useFeatures();
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
            {spotifyComparison
              ? "See how your taste lines up with your friends and the current trend on Spotify. Visualize your ratings and similarity scores as interactive graphs."
              : "See how your taste lines up with your friends. Visualize your ratings and similarity scores as interactive graphs."}
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

const TRENDING_TABS: TabOption<TrendingTab>[] = [
  { value: "albums", label: "Albums" },
  { value: "artists", label: "Artists" },
];

type TrendingTab = "albums" | "artists";

function LoggedInHome({ displayName }: { displayName: string }) {
  // Desktop stacks both trending boxes in the sticky rail. On phones that is
  // ~700px of list above the activity feed, so there they become one tabbed box
  // and the timeline starts on the first screen. The tab bar and the `paneOff`
  // hiding are both phone-only (see HomePage.module.css) — desktop is unchanged.
  const [trendingTab, setTrendingTab] = useState<TrendingTab>("albums");

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
          {/* Wrapper carries the show/hide so it doesn't fight Tabs' own
              `display` rule at equal specificity (bundle order would decide). */}
          <div className={styles.trendingTabs}>
            <Tabs
              options={TRENDING_TABS}
              value={trendingTab}
              onChange={setTrendingTab}
              variant="subtle"
              ariaLabel="Trending"
            />
          </div>

          <div
            className={`${styles.pane} ${trendingTab === "albums" ? "" : styles.paneOff}`}
          >
            <TrendingBox
              title="Trending Albums"
              fetchItems={getTrendingAlbums}
              keyOf={(a) => a.spotify_id}
              renderRow={(a) => <TrendingAlbumRow album={a} />}
            />
          </div>
          <div
            className={`${styles.pane} ${trendingTab === "artists" ? "" : styles.paneOff}`}
          >
            <TrendingBox
              title="Trending Artists"
              fetchItems={getTrendingArtists}
              keyOf={(a) => a.artist_spotify_id}
              renderRow={(a) => <TrendingArtistRow artist={a} />}
            />
          </div>
        </aside>

        <section className={styles.feedCol}>
          <ActivityFeed />
        </section>
      </div>
    </main>
  );
}

