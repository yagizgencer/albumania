import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album, type AlbumTrack } from "../api/albums";
import {
  fetchComparison,
  type ComparisonSource,
  type FriendDashboardEntry,
  type FriendDashboardResponse,
} from "../api/friendDashboard";
import { deleteRating, getMyRatingForAlbum } from "../api/ratings";
import { useAuth } from "../context/AuthContext";
import { formatDuration } from "../utils/duration";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { Avatar } from "../components/Avatar";
import { ExternalLinkIcon, SpotifyIcon, TrashIcon } from "../components/Icons";
import { ImageLightbox } from "../components/ImageLightbox";
import { formatDate } from "../lib/date";
import { setDashboardCompare, type DashboardBackState } from "../lib/dashboardCompare";
import { profilePath } from "../lib/paths";
import styles from "./AlbumDetailPage.module.css";

// Per-album comparison detail, driven off either route:
//   /friendships/:friendshipId/albums/:spotifyId  → friendship source
//   /users/:username/compare/:spotifyId           → live user source
export function FriendAlbumDetailPage() {
  const { friendshipId, username, spotifyId } = useParams<{
    friendshipId: string;
    username: string;
    spotifyId: string;
  }>();
  const source: ComparisonSource | null = friendshipId
    ? { kind: "friendship", friendshipId: Number(friendshipId) }
    : username
    ? { kind: "user", username }
    : null;
  const { username: me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // When we arrive from an album page, `backTo` tells us which dashboard to
  // return to (and which comparison to restore). Otherwise, go back in history.
  const backTo = (location.state as { backTo?: DashboardBackState } | null)?.backTo ?? null;

  function goBackToDashboard() {
    if (backTo) {
      setDashboardCompare(backTo.profile, backTo.compareSource);
      navigate(profilePath(backTo.profile));
    } else {
      navigate(-1);
    }
  }

  // Remove my own rating for this album (I'm always user A in the comparison),
  // then leave — this detail view no longer exists, so go to my profile.
  async function handleRemoveRating() {
    if (!album || !me) return;
    setRemoving(true);
    const mine = await getMyRatingForAlbum(album.id);
    await deleteRating(mine.id);
    navigate(profilePath(me));
  }
  const [album, setAlbum] = useState<Album | null>(null);
  const [pair, setPair] = useState<FriendDashboardResponse | null>(null);
  const [entry, setEntry] = useState<FriendDashboardEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const sourceKey =
    source?.kind === "friendship"
      ? `f${source.friendshipId}`
      : source?.kind === "user"
      ? `u${source.username}`
      : "";

  useEffect(() => {
    if (!source || !spotifyId) return;
    setError(null);

    Promise.all([fetchComparison(source), getAlbum(spotifyId)])
      .then(([pairData, albumData]) => {
        setPair(pairData);
        setAlbum(albumData);
        const match = pairData.entries.find((e) => e.album.spotify_id === spotifyId);
        if (!match) {
          setError("This album isn't on the comparison yet.");
        } else {
          setEntry(match);
        }
      })
      .catch((err) => {
        if (err?.response?.status === 403) setError("Access denied.");
        else if (err?.response?.status === 404) setError("Not found.");
        else setError("Could not load album.");
      });
    // sourceKey encodes source; re-fetch when it or the album changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, spotifyId]);

  const trackByIndex = useMemo(
    () => new Map<number, AlbumTrack>((album?.tracks ?? []).map((t) => [t.index, t])),
    [album]
  );

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (!album || !pair || !entry)
    return <main className={styles.page}><LoadingState /></main>;

  const renderList = (indices: number[]) =>
    indices
      .map((idx) => trackByIndex.get(idx))
      .filter((t): t is AlbumTrack => t !== undefined);

  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;
  // I can remove my rating whichever slot I'm in — user_a is just the
  // alphabetically-first username, not necessarily me.
  const isMine = me === pair.user_a_username || me === pair.user_b_username;

  // The three participants a similarity pairing can reference, resolved to an
  // avatar. Spotify is a special "party" rendered as the Spotify mark.
  const userA: SimParty = {
    username: pair.user_a_username,
    pictureUrl: pair.user_a_picture_url,
  };
  const userB: SimParty = {
    username: pair.user_b_username,
    pictureUrl: pair.user_b_picture_url,
  };
  const spotify: SimParty = "spotify";

  return (
    <main className={styles.page}>
      <button
        type="button"
        onClick={goBackToDashboard}
        className={styles.backLink}
      >
        ‹ Dashboard
      </button>

      <section className={styles.card}>
        <div className={styles.headerTop}>
          {album.album_art_url && (
            <ImageLightbox
              src={album.album_art_url}
              alt={`${album.title} cover`}
              thumbClassName={styles.art}
            />
          )}
          <div className={styles.meta}>
            <div className={styles.headline}>
              <div className={styles.titleRow}>
                <h1>
                  <Link className={styles.headerLink} to={`/albums/${album.spotify_id}`}>
                    {album.title}
                  </Link>
                  <a
                    className={styles.spotifyLink}
                    href={spotifyAlbumUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open on Spotify"
                    data-tip="Open on Spotify"
                  >
                    <ExternalLinkIcon size={14} className={styles.spotifyArrow} />
                    <SpotifyIcon size={19} className={styles.spotifyMark} />
                  </a>
                </h1>
                {/* Remove rating (only when I'm in the comparison) — the same
                    circular trash chip as the album page. */}
                {isMine && (
                  <div className={styles.iconBar}>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconRemove}`}
                      onClick={() => setConfirmingRemove(true)}
                      disabled={removing}
                      aria-label="Remove my rating"
                      data-tip="Remove my rating"
                    >
                      <TrashIcon size={26} />
                    </button>
                  </div>
                )}
              </div>
              <h2>
                {album.artist_spotify_id ? (
                  <Link className={styles.headerLink} to={`/artists/${album.artist_spotify_id}`}>
                    {album.artist}
                  </Link>
                ) : (
                  album.artist
                )}
              </h2>
              {/* Metadata slot now carries just "Rated on" (release date +
                  album length removed). */}
              <div className={styles.metaChips}>
                <span className={styles.metaChip}>
                  <span className={styles.metaChipText}>
                    Rated on {formatDate(entry.mutual_date)}
                  </span>
                </span>
              </div>
            </div>

            {/* Similarity Scores — one teal tile per pairing (score on top, the
                two avatars below). Album scores live on the top-5 cards. */}
            <div className={styles.simBlock}>
              <div className={styles.simHead}>
                <span className={styles.simRule} />
                <span className={styles.simTitle}>Similarity Scores</span>
                <span className={styles.simRule} />
              </div>
              <div className={styles.simTiles}>
                <SimTile left={userA} right={userB} value={entry.similarity_users} />
                <SimTile left={userA} right={spotify} value={entry.similarity_a_vs_spotify} />
                <SimTile left={userB} right={spotify} value={entry.similarity_b_vs_spotify} />
              </div>
            </div>

            {/* Inline confirm shown after the Remove chip is clicked. */}
            {isMine && confirmingRemove && (
              <div className={styles.confirm}>
                <span className={styles.confirmText}>Remove your rating?</span>
                <button
                  className={`${styles.btn} ${styles.btnRemoveConfirm}`}
                  onClick={handleRemoveRating}
                  disabled={removing}
                >
                  {removing ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnCancel}`}
                  onClick={() => setConfirmingRemove(false)}
                  disabled={removing}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.columns}>
        <TopList
          username={pair.user_a_username}
          score={entry.user_a_score}
          tracks={renderList(entry.user_a_top_track_indices)}
        />
        <TopList
          username={pair.user_b_username}
          score={entry.user_b_score}
          tracks={renderList(entry.user_b_top_track_indices)}
        />
        {/* Spotify isn't a user (no profile, no album score). */}
        <TopList
          title="Spotify's top 5"
          score={null}
          tracks={renderList(entry.spotify_top5_indices)}
        />
      </section>
    </main>
  );
}

interface TopListProps {
  // A user column links its name to the profile; Spotify passes a plain `title`.
  username?: string;
  title?: string;
  // The album score for this person (null for Spotify — it has none).
  score: number | null;
  tracks: AlbumTrack[];
}

function TopList({ username, title, score, tracks }: TopListProps) {
  return (
    <div className={styles.column}>
      <div className={styles.columnHead}>
        <h3>
          {username ? (
            <>
              <Link className={styles.columnNameLink} to={profilePath(username)}>
                {username}
              </Link>
              ’s top 5
            </>
          ) : (
            title
          )}
        </h3>
        {score != null && (
          <span className={styles.columnScore}>
            {score.toFixed(1)}
            <span className={styles.columnScoreOut}>/10</span>
          </span>
        )}
      </div>
      <ol>
        {tracks.map((t) => (
          <li key={t.index}>
            <span className={styles.trackRowInner}>
              <span className={styles.trackRowName}>
                {t.spotify_url ? (
                  <a href={t.spotify_url} target="_blank" rel="noreferrer">{t.name}</a>
                ) : (
                  t.name
                )}
              </span>
              {t.duration_ms != null && (
                <span className={styles.trackRowMeta}>{formatDuration(t.duration_ms)}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// A participant in a similarity pairing: either a user (avatar + name) or the
// special "spotify" party (rendered as the Spotify mark).
type SimParty = { username: string; pictureUrl: string | null } | "spotify";

// A clickable participant avatar: a user links to their profile; Spotify links
// out to Spotify.
function PartyAvatar({ party }: { party: SimParty }) {
  if (party === "spotify") {
    return (
      <a
        className={styles.simAvatarLink}
        href="https://open.spotify.com"
        target="_blank"
        rel="noreferrer"
        aria-label="Spotify"
        data-tip="Spotify"
      >
        <span className={styles.simSpotify}>
          <SpotifyIcon size={22} />
        </span>
      </a>
    );
  }
  return (
    <Link
      className={styles.simAvatarLink}
      to={profilePath(party.username)}
      aria-label={party.username}
      data-tip={party.username}
    >
      <Avatar username={party.username} pictureUrl={party.pictureUrl} size={28} />
    </Link>
  );
}

// One similarity tile: the teal value on top, the two parties (avatar <->
// avatar) below. The label is carried by the (clickable) avatars.
function SimTile({
  left,
  right,
  value,
}: {
  left: SimParty;
  right: SimParty;
  value: number | null;
}) {
  return (
    <div className={styles.simTile}>
      <span className={styles.simPill}>{value === null ? "—" : value.toFixed(2)}</span>
      <span className={styles.simPair}>
        <PartyAvatar party={left} />
        <span className={styles.simDash}>&lt;-&gt;</span>
        <PartyAvatar party={right} />
      </span>
    </div>
  );
}
