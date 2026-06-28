import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import { listFriendships } from "../api/friendships";
import { getListenLater, type ListenLaterEntry } from "../api/invites";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import SketchUnderline from "../components/SketchUnderline";
import { LoadingState } from "../components/Spinner";
import { formatDate } from "../lib/date";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { username, profile, isLoading } = useAuth();

  if (isLoading) return <main className={styles.page}><LoadingState /></main>;
  if (!username) return <PublicLanding />;
  return <LoggedInHome username={username} displayName={profile?.display_name ?? username} pictureUrl={profile?.profile_picture_url ?? null} />;
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
// Logged-in home — welcome + stats + recent ratings
// ---------------------------------------------------------------------------

interface LoggedInHomeProps {
  username: string;
  displayName: string;
  pictureUrl: string | null;
}

function LoggedInHome({ username, displayName, pictureUrl }: LoggedInHomeProps) {
  const [recent, setRecent] = useState<DashboardEntry[] | null>(null);
  const [albumCount, setAlbumCount] = useState<number | null>(null);
  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [listenLaterCount, setListenLaterCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [dash, friends, later] = await Promise.allSettled([
        getDashboard(username),
        listFriendships(),
        getListenLater(),
      ]);
      if (cancelled) return;
      if (dash.status === "fulfilled") {
        const entries = dash.value.entries;
        setAlbumCount(entries.length);
        // Show the 6 most recent published ratings.
        const sorted = [...entries].sort((a, b) =>
          b.completed_at.localeCompare(a.completed_at)
        );
        setRecent(sorted.slice(0, 6));
      } else {
        setAlbumCount(0);
        setRecent([]);
      }
      if (friends.status === "fulfilled") {
        setFriendCount(friends.value.accepted.length);
      }
      if (later.status === "fulfilled") {
        setListenLaterCount((later.value as ListenLaterEntry[]).length);
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  return (
    <main className={styles.page}>
      <section className={styles.welcome}>
        <Avatar
          username={username}
          pictureUrl={pictureUrl}
          displayName={displayName}
          size={72}
        />
        <div className={styles.welcomeText}>
          <h1>Welcome back, {displayName}.</h1>
          <div className={styles.welcomeUnderline}>
            <SketchUnderline color="#8a78dd" />
          </div>
          <p>What did you listen to today?</p>
        </div>
      </section>

      <section className={styles.statsRow}>
        <Link to={`/profile/${username}`} className={styles.statCard}>
          <div className={styles.statValue}>{albumCount ?? "—"}</div>
          <div className={styles.statLabel}>Albums rated</div>
        </Link>
        <Link to="/friends" className={styles.statCard}>
          <div className={styles.statValue}>{friendCount ?? "—"}</div>
          <div className={styles.statLabel}>Friends</div>
        </Link>
        <Link to="/listen-later" className={styles.statCard}>
          <div className={styles.statValue}>{listenLaterCount ?? "—"}</div>
          <div className={styles.statLabel}>In Listen Later</div>
        </Link>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Recently rated</h2>
          <Link to={`/profile/${username}`}>See full dashboard →</Link>
        </div>
        {recent === null ? (
          <LoadingState />
        ) : recent.length === 0 ? (
          <div className={styles.emptyCard}>
            You haven't published a rating yet.{" "}
            <Link to="/listen-later">Find an album to start with</Link>.
          </div>
        ) : (
          <div className={styles.recentList}>
            {recent.map((e) => (
              <Link
                key={e.album.id}
                to={`/albums/${e.album.spotify_id}`}
                className={styles.recentCard}
              >
                {e.album.album_art_url && (
                  <img
                    src={e.album.album_art_url}
                    alt=""
                    className={styles.recentArt}
                  />
                )}
                <div className={styles.recentTitle}>{e.album.title}</div>
                <div className={styles.recentArtist}>{e.album.artist}</div>
                <div className={styles.recentFooter}>
                  <span className={styles.recentScore}>{e.score.toFixed(1)}</span>
                  <span>{formatDate(e.completed_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

