import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album } from "../api/albums";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import { getUser } from "../api/users";
import { deleteRating, getMyRatingForAlbum } from "../api/ratings";
import { useAuth } from "../context/AuthContext";
import { formatDuration } from "../utils/duration";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { Avatar } from "../components/Avatar";
import { ExternalLinkIcon, SpotifyIcon, TrashIcon } from "../components/Icons";
import { formatDate } from "../lib/date";
import { setDashboardCompare, type DashboardBackState } from "../lib/dashboardCompare";
import { profilePath } from "../lib/paths";
import { ImageLightbox } from "../components/ImageLightbox";
import styles from "./AlbumDetailPage.module.css";

export function AlbumDetailPage() {
  const { username, spotifyId } = useParams<{ username: string; spotifyId: string }>();
  const { username: me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMine = !!me && me === username;
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
  const [album, setAlbum] = useState<Album | null>(null);
  const [entry, setEntry] = useState<DashboardEntry | null>(null);
  // The profile owner's avatar, for the similarity tile (dashboard has no photo).
  const [ownerPictureUrl, setOwnerPictureUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!username || !spotifyId) return;
    setError(null);
    Promise.all([getAlbum(spotifyId), getDashboard(username)])
      .then(([albumData, dashboard]) => {
        setAlbum(albumData);
        const match = dashboard.entries.find((e) => e.album.spotify_id === spotifyId);
        if (!match) {
          setError(`${username} hasn't published a rating for this album yet.`);
        } else {
          setEntry(match);
        }
        // Best-effort: enrich with the owner's avatar; the page works without it.
        getUser(username)
          .then((u) => setOwnerPictureUrl(u.profile_picture_url))
          .catch(() => setOwnerPictureUrl(null));
      })
      .catch((err) => {
        if (err?.response?.status === 403) setError("This profile is visible to friends only.");
        else if (err?.response?.status === 404) setError("Not found.");
        else setError("Could not load album.");
      });
  }, [username, spotifyId]);

  // Remove my own rating for this album, then leave — the detail view no longer
  // exists, so go to my profile.
  async function handleRemoveRating() {
    if (!album || !me) return;
    setRemoving(true);
    const mine = await getMyRatingForAlbum(album.id);
    await deleteRating(mine.id);
    navigate(profilePath(me));
  }

  if (error) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (!album || !entry) return <main className={styles.page}><LoadingState /></main>;

  const trackByIndex = new Map(album.tracks.map((t) => [t.index, t]));
  const renderList = (indices: number[]) =>
    indices
      .map((idx) => trackByIndex.get(idx))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

  const userTracks = renderList(entry.top_track_indices);
  const spotifyTracks = renderList(entry.spotify_top5_indices);

  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;

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
              {/* Title links to the album page; the old "Go to album page"
                  button is gone. A Spotify pop-out (arrow + mark) sits after the
                  title, copied from the Album Info box. */}
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
                {/* Remove rating: the same circular trash chip as the album
                    page, top-right of the title row. */}
                {isMine && (
                  <div className={styles.iconBar}>
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconRemove}`}
                      onClick={() => setConfirmingRemove(true)}
                      disabled={removing}
                      aria-label="Remove rating"
                      data-tip="Remove rating"
                    >
                      <TrashIcon size={26} />
                    </button>
                  </div>
                )}
              </div>
              {/* Artist text links to the artist page (was the "Go to artist
                  page" button). */}
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
                    Rated on {formatDate(entry.completed_at)}
                  </span>
                </span>
              </div>
            </div>

            {/* Similarity Scores — one teal tile (this user – Spotify). The
                album score lives on the top-5 card below. */}
            <div className={`${styles.simBlock} ${styles.simBlockSingle}`}>
              <div className={styles.simHead}>
                <span className={styles.simRule} />
                <span className={styles.simTitle}>Similarity Scores</span>
                <span className={styles.simRule} />
              </div>
              <div className={styles.simTiles}>
                <div className={styles.simTile}>
                  <span className={styles.simPill}>
                    {entry.similarity_user_vs_spotify === null
                      ? "—"
                      : entry.similarity_user_vs_spotify.toFixed(2)}
                  </span>
                  <span className={styles.simPair}>
                    <Link
                      className={styles.simAvatarLink}
                      to={profilePath(username ?? "")}
                      aria-label={username ?? ""}
                      data-tip={username ?? ""}
                    >
                      <Avatar
                        username={username ?? ""}
                        pictureUrl={ownerPictureUrl}
                        size={28}
                      />
                    </Link>
                    <span className={styles.simDash}>&lt;-&gt;</span>
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
                  </span>
                </div>
              </div>
            </div>

            {/* Inline confirm shown after the Remove chip is clicked. */}
            {isMine && confirmingRemove && (
              <div className={styles.confirm}>
                <span className={styles.confirmText}>Remove this rating?</span>
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
        <div className={styles.column}>
          <div className={styles.columnHead}>
            <h3>
              <Link className={styles.columnNameLink} to={profilePath(username ?? "")}>
                {username}
              </Link>
              ’s top 5
            </h3>
            <span className={styles.columnScore}>
              {entry.score.toFixed(1)}
              <span className={styles.columnScoreOut}>/10</span>
            </span>
          </div>
          <ol>
            {userTracks.map((t) => (
              <li key={t.index}>
                <span className={styles.trackRowInner}>
                  <span className={styles.trackRowName}>
                    {t.spotify_url ? (
                      <a href={t.spotify_url} target="_blank" rel="noreferrer">
                        {t.name}
                      </a>
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

        <div className={styles.column}>
          {/* Spotify isn't rated, so its card carries no album score. */}
          <div className={styles.columnHead}>
            <h3>Spotify's top 5</h3>
          </div>
          <ol>
            {spotifyTracks.map((t) => (
              <li key={t.index}>
                <span className={styles.trackRowInner}>
                  <span className={styles.trackRowName}>
                    {t.spotify_url ? (
                      <a href={t.spotify_url} target="_blank" rel="noreferrer">
                        {t.name}
                      </a>
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
      </section>
    </main>
  );
}
