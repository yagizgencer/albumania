import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getAlbum,
  getAlbumFriendRatings,
  getAlbumStats,
  type Album,
  type AlbumFriendRating,
  type AlbumStats,
} from "../api/albums";
import {
  createInvite,
  getListenLater,
  listMyInvites,
  type ListenInvite,
  type ListenLaterParticipant,
} from "../api/invites";
import {
  createRating,
  deleteRating,
  getMyRatingForAlbum,
  type Rating,
} from "../api/ratings";
import { useAuth } from "../context/AuthContext";
import { listFriendships, type Friendship } from "../api/friendships";
import { formatDuration } from "../utils/duration";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { CommentsSection } from "../components/CommentsSection";
import { Avatar } from "../components/Avatar";
import { ChevronDownIcon, ExternalLinkIcon, SpotifyIcon } from "../components/Icons";
import { ImageLightbox } from "../components/ImageLightbox";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { useUnsavedNavigationGuard } from "../lib/unsavedChanges";
import { formatDate } from "../lib/date";
import { isRateable, RATEABLE_RULE_TEXT } from "../lib/albumRules";
import type { DashboardBackState } from "../lib/dashboardCompare";
import { profilePath } from "../lib/paths";
import styles from "./AlbumInfoPage.module.css";

interface FriendForInvite {
  username: string;
}

export function AlbumInfoPage() {
  const { spotifyId } = useParams<{ spotifyId: string }>();
  const navigate = useNavigate();
  const { username: me } = useAuth();
  // Prompt before leaving with an unsaved comment draft (add or edit).
  const unsavedGuard = useUnsavedNavigationGuard();

  const [album, setAlbum] = useState<Album | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [stats, setStats] = useState<AlbumStats | null>(null);
  const [friendRatings, setFriendRatings] = useState<AlbumFriendRating[]>([]);
  // Usernames I've already sent a (still-pending) invite to for this album.
  const [pendingInvitees, setPendingInvitees] = useState<Set<string>>(new Set());
  // Usernames who have sent *me* a (still-pending) invite for this album.
  const [pendingInviters, setPendingInviters] = useState<Set<string>>(new Set());
  // Accepted/committed participants for this album (drives "active invite" below
  // and pre-marks friends in the invite modal).
  const [participants, setParticipants] = useState<ListenLaterParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  useEffect(() => {
    if (!spotifyId) return;
    setLoading(true);
    setError(null);
    getAlbum(spotifyId)
      .then(async (a) => {
        setAlbum(a);
        try {
          setRating(await getMyRatingForAlbum(a.id));
        } catch {
          setRating(null);
        }
        try {
          setStats(await getAlbumStats(spotifyId));
        } catch {
          setStats(null);
        }
        try {
          setFriendRatings(await getAlbumFriendRatings(spotifyId));
        } catch {
          setFriendRatings([]);
        }
        await loadInviteState(a.id);
      })
      .catch(() => setError("Could not load album."))
      .finally(() => setLoading(false));
  }, [spotifyId]);

  // Pull invite state for this album from the two existing endpoints:
  //  - listMyInvites → my still-pending invites, both directions (these don't
    //    appear in Listen Later until someone accepts).
  //  - getListenLater → this album's accepted participants (committed shared
  //    listen, either direction).
  async function loadInviteState(albumId: number) {
    try {
      const invites = await listMyInvites();
      setPendingInvitees(
        new Set(
          invites.outgoing
            .filter((i) => i.album_id === albumId && i.status === "pending")
            .map((i) => i.receiver_username)
        )
      );
      setPendingInviters(
        new Set(
          invites.incoming
            .filter((i) => i.album_id === albumId && i.status === "pending")
            .map((i) => i.sender_username)
        )
      );
    } catch {
      setPendingInvitees(new Set());
      setPendingInviters(new Set());
    }
    try {
      const entry = (await getListenLater()).find((e) => e.album.id === albumId);
      setParticipants(entry?.participants ?? []);
    } catch {
      setParticipants([]);
    }
  }

  const isPublished = rating?.status === "published";

  // "Active invite" = an invite in either direction has been *accepted*, so the
  // album is already a committed shared listen (and already in my Listen Later).
  // A merely-pending invite I sent does NOT count — until they accept, I still
  // want the normal "Listen Later" option.
  const hasActiveInvite = participants.some((p) => p.invite_status === "accepted");

  // The viewer's top-5 ranking: track index → position (1 = favourite), only
  // relevant once published.
  const top5Rank = useMemo(() => {
    const ranks = new Map<number, number>();
    if (rating?.status === "published" && rating.top_track_indices) {
      rating.top_track_indices.forEach((idx, i) => {
        if (idx != null) ranks.set(idx, i + 1);
      });
    }
    return ranks;
  }, [rating]);

  async function handleAddToListenLater() {
    if (!album) return;
    setBusy(true); setActionError(null); setActionInfo(null);
    try {
      const r = await createRating(album.id);
      setRating(r);
      setActionInfo("Added to your Listen Later.");
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios error
      setActionError((e as any)?.response?.data?.detail ?? "Could not add to Listen Later.");
    } finally {
      setBusy(false);
    }
  }

  // "Rate" always just opens the editor. It creates the draft on arrival if the
  // user doesn't have one yet, so there's no separate start/continue distinction.
  // Pass `from` so the editor can return here after publishing.
  function handleRate() {
    if (!album) return;
    navigate(`/albums/${album.spotify_id}/rate`, {
      state: { from: `/albums/${album.spotify_id}` },
    });
  }

  async function handleRemoveRating() {
    if (!rating) return;
    setBusy(true); setActionError(null); setActionInfo(null);
    try {
      await deleteRating(rating.id);
      setRating(null);
      setConfirmingRemove(false);
      setActionInfo("Your rating was removed.");
      // The album's average no longer includes our score — refresh it.
      if (spotifyId) {
        try { setStats(await getAlbumStats(spotifyId)); } catch { /* keep prior stats */ }
      }
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setActionError((e as any)?.response?.data?.detail ?? "Could not remove your rating.");
    } finally {
      setBusy(false);
    }
  }

  // Jump to a friend's ratings for this album. If we've already published our
  // own rating, open the pair comparison; otherwise show the friend vs Spotify.
  // Either way, "Back to dashboard" on that page returns to the friend's
  // dashboard with the matching comparison pre-selected.
  function handlePickFriend(friend: AlbumFriendRating) {
    if (!album) return;
    const backTo: DashboardBackState = {
      profile: friend.username,
      compareSource: isPublished
        ? { kind: "friendship", friendshipId: friend.friendship_id }
        : null,
    };
    const target = isPublished
      ? `/friendships/${friend.friendship_id}/albums/${album.spotify_id}`
      : `/users/${friend.username}/albums/${album.spotify_id}`;
    navigate(target, { state: { backTo } });
  }

  if (loading) return <main className={styles.page}><LoadingState /></main>;
  if (error || !album) return <main className={styles.page}><Alert>{error ?? "Not found."}</Alert></main>;

  const totalMs = album.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const hasAnyDuration = album.tracks.some((t) => t.duration_ms != null);
  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;
  const rateable = isRateable(album.total_songs);

  return (
    <main className={styles.page}>
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
          {/* Title + artist on the left; the album details (released / tracks /
              runtime) float to the top-right. */}
          <div className={styles.headline}>
            <div className={styles.titleBlock}>
              <h1>
                <Link className={styles.headerLink} to={`/albums/${album.spotify_id}`}>
                  {album.title}
                </Link>
                {/* Pop-out link to the album on Spotify: a small Spotify mark + an
                    external-link arrow, sitting just after the title. */}
                <a
                  className={styles.spotifyLink}
                  href={spotifyAlbumUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open on Spotify"
                  title="Open on Spotify"
                >
                  <ExternalLinkIcon size={14} className={styles.spotifyArrow} />
                  <SpotifyIcon size={16} className={styles.spotifyMark} />
                </a>
              </h1>
              <h2>
                {album.artist_spotify_id ? (
                  <Link className={styles.headerLink} to={`/artists/${album.artist_spotify_id}`}>
                    {album.artist}
                  </Link>
                ) : (
                  album.artist
                )}
              </h2>
            </div>
            <p className={styles.details}>
              Released {formatDate(album.release_date)} · {album.total_songs} tracks
              {hasAnyDuration && <> · {formatDuration(totalMs)}</>}
            </p>
          </div>

          {/* Scores row: the labelled amber figures on the left, and the owner's
              remove control on the right — aligned with the score boxes. */}
          <div className={styles.stats}>
            <div className={styles.statGroup}>
              {stats && stats.num_raters > 0 && stats.mean_score !== null ? (
                <div className={styles.statItem}>
                  <span className={styles.scoreChip}>
                    {stats.mean_score.toFixed(1)}
                    <span className={styles.scoreChipOut}>/10</span>
                  </span>
                  <span className={styles.statLabel}>
                    Average score
                    <span className={styles.statCount}>({stats.num_raters})</span>
                  </span>
                </div>
              ) : (
                <div className={styles.statItem}>
                  <span className={styles.statEmpty}>No ratings yet</span>
                  <span className={styles.statLabel}>Average score</span>
                </div>
              )}
              {isPublished && rating?.score != null && (
                <div className={styles.statItem}>
                  <span className={styles.scoreChip}>
                    {rating.score.toFixed(1)}
                    <span className={styles.scoreChipOut}>/10</span>
                  </span>
                  <span className={styles.statLabel}>Your score</span>
                </div>
              )}
            </div>

            {isPublished && (
              !confirmingRemove ? (
                <button
                  className={styles.removeBtn}
                  onClick={() => { setConfirmingRemove(true); setActionError(null); setActionInfo(null); }}
                  disabled={busy}
                >
                  Remove rating
                </button>
              ) : (
                <div className={styles.confirm}>
                  <span className={styles.confirmText}>Remove this rating?</span>
                  <button
                    className={`${styles.btn} ${styles.btnRemoveConfirm}`}
                    onClick={handleRemoveRating}
                    disabled={busy}
                  >
                    {busy ? "Removing…" : "Yes, remove"}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnCancel}`}
                    onClick={() => setConfirmingRemove(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>

          <div className={styles.actions}>
            {/* Anything not yet published shows a single "Rate" action (the
                editor creates the draft on arrival if needed). "Listen Later" is
                a fresh solo add, so only when there's no rating/invite yet. */}
            {!isPublished && (
              <>
                {!rating && !hasActiveInvite && (
                  <button
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={handleAddToListenLater}
                    disabled={busy || !rateable}
                  >
                    Listen Later
                  </button>
                )}
                <button
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={handleRate}
                  disabled={busy || !rateable}
                >
                  Rate
                </button>
              </>
            )}
            {!isPublished && (
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => { setInviteModalOpen(true); setActionError(null); setActionInfo(null); }}
                disabled={busy || !rateable}
              >
                Invite a friend
              </button>
            )}
          </div>
          {friendRatings.length > 0 && (
            <FriendRatingsPicker friends={friendRatings} onPick={handlePickFriend} />
          )}
          {!rateable && <p className={styles.ruleNote}>{RATEABLE_RULE_TEXT}</p>}
          {actionError && <Alert>{actionError}</Alert>}
          {actionInfo && <p className={styles.info}>{actionInfo}</p>}
        </div>
      </div>

      {/* Tracks: a collapsible built into the card, set off by a subtle divider. */}
      <div className={styles.tracksBlock}>
        <button
          type="button"
          className={`${styles.tracksToggle} ${tracksOpen ? styles.tracksToggleOpen : ""}`}
          onClick={() => setTracksOpen((o) => !o)}
          aria-expanded={tracksOpen}
          aria-label={`Tracks (${album.tracks.length})`}
        >
          <span className={styles.tracksLabel}>Tracks</span>
          <span className={styles.tracksCount}>{album.tracks.length}</span>
          <ChevronDownIcon
            size={20}
            className={`${styles.chevron} ${tracksOpen ? styles.chevronOpen : ""}`}
          />
        </button>
        {tracksOpen && (
          <ul className={styles.trackList}>
            {album.tracks.map((t) => (
              <li key={t.index} className={styles.trackRow}>
                <span className={styles.trackNum}>{t.index}</span>
                <span className={styles.trackName}>
                  {t.spotify_url ? (
                    <a href={t.spotify_url} target="_blank" rel="noreferrer">
                      {t.name}
                    </a>
                  ) : (
                    t.name
                  )}
                  {isPublished && top5Rank.has(t.index) && (
                    <span className={styles.top5} title={`Your #${top5Rank.get(t.index)} pick`}>
                      #{top5Rank.get(t.index)}
                    </span>
                  )}
                </span>
                <span className={styles.trackDuration}>{formatDuration(t.duration_ms)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      </section>

      <CommentsSection spotifyId={album.spotify_id} />

      {inviteModalOpen && me && (
        <InviteModal
          albumId={album.id}
          me={me}
          alreadyInvited={pendingInvitees}
          invitedMe={pendingInviters}
          listeningWith={
            new Set(
              participants
                .filter((p) => p.invite_status === "accepted")
                .map((p) => p.username)
            )
          }
          alreadyRated={new Set(friendRatings.map((f) => f.username))}
          onClose={() => setInviteModalOpen(false)}
          onSent={(friend: FriendForInvite) => {
            setActionInfo(`Invite sent to ${friend.username}.`);
            // Keep the modal open so the friend shows as "Invited"; refresh the
            // page's invite state so the action buttons update too.
            void loadInviteState(album.id);
          }}
        />
      )}

      <UnsavedChangesModal {...unsavedGuard} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// FriendRatingsPicker — searchable dropdown of friends who rated this album
// ---------------------------------------------------------------------------

function FriendRatingsPicker({
  friends,
  onPick,
}: {
  friends: AlbumFriendRating[];
  onPick: (friend: AlbumFriendRating) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        f.display_name.toLowerCase().includes(q)
    );
  }, [friends, query]);

  return (
    <div className={styles.friendRatings} ref={wrapRef}>
      <span className={styles.friendRatingsLabel}>See a friend's ratings</span>
      <div className={styles.combobox}>
        <input
          className={styles.friendRatingsInput}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="album-friend-ratings-list"
          placeholder="Search friends…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        {open && (
          <ul
            id="album-friend-ratings-list"
            role="listbox"
            className={styles.comboList}
          >
            {filtered.length === 0 ? (
              <li className={styles.comboEmpty}>No matches</li>
            ) : (
              filtered.map((f) => (
                <li
                  key={f.friendship_id}
                  role="option"
                  aria-selected={false}
                  className={styles.comboItem}
                  onClick={() => {
                    onPick(f);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {f.display_name}
                  <span className={styles.comboUser}>@{f.username}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite modal — searchable list of accepted friends
// ---------------------------------------------------------------------------

function InviteModal({
  albumId,
  me,
  alreadyInvited,
  invitedMe,
  listeningWith,
  alreadyRated,
  onClose,
  onSent,
}: {
  albumId: number;
  me: string;
  // Friends I've already sent a pending invite to for this album (grey out: "Invited").
  alreadyInvited: Set<string>;
  // Friends who have already invited *me* for this album (grey out: "Invited you").
  invitedMe: Set<string>;
  // Friends already listening this album with me — an accepted invite exists,
  // either direction (grey out: "Listening").
  listeningWith: Set<string>;
  // Friends who already published a rating for this album (grey out: "Rated").
  alreadyRated: Set<string>;
  onClose: () => void;
  onSent: (friend: FriendForInvite) => void;
}) {
  const [friends, setFriends] = useState<Friendship[] | null>(null);
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [sentSet, setSentSet] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    listFriendships()
      .then((data) => setFriends(data.accepted))
      .catch(() => setFriends([]));
  }, []);

  const friendList = useMemo(() => {
    if (!friends) return [];
    return friends
      .map((f) =>
        f.user_a_username === me
          ? { username: f.user_b_username, pictureUrl: f.user_b_picture_url }
          : { username: f.user_a_username, pictureUrl: f.user_a_picture_url }
      )
      .filter((f) => f.username.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [friends, me, filter]);

  async function handleSend(username: string) {
    setSending(username);
    setErrors((prev) => { const { [username]: _, ...rest } = prev; return rest; });
    try {
      const invite: ListenInvite = await createInvite(username, albumId);
      setSentSet((prev) => new Set(prev).add(username));
      onSent({ username });
      void invite;
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail ?? "Could not send invite.";
      setErrors((prev) => ({ ...prev, [username]: detail }));
    } finally {
      setSending(null);
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Invite a friend</h3>
        <input
          type="search"
          placeholder="Search friends…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
        {friends === null ? (
          <p className={styles.friendEmpty}>Loading friends…</p>
        ) : friendList.length === 0 ? (
          <p className={styles.friendEmpty}>
            {friends.length === 0 ? "You have no friends yet." : "No matches."}
          </p>
        ) : (
          <ul className={styles.friendList}>
            {friendList.map(({ username, pictureUrl }) => {
              const hasRated = alreadyRated.has(username);
              const listening = listeningWith.has(username);
              const theyInvitedMe = invitedMe.has(username);
              const iInvited = sentSet.has(username) || alreadyInvited.has(username);
              const err = errors[username];
              // Distinct, grayed-out states, in priority order. Each can't be
              // (re-)invited because an invite already exists (or they've rated).
              const disabled = hasRated || listening || theyInvitedMe || iInvited;
              const label = hasRated
                ? "Rated"
                : listening
                ? "Listening"
                : theyInvitedMe
                ? "Invited you"
                : iInvited
                ? "Invited"
                : sending === username
                ? "Sending…"
                : "Invite";
              const note = hasRated
                ? "Already rated this album"
                : listening
                ? "Already listening with you"
                : theyInvitedMe
                ? `${username} already invited you — check Listen Later`
                : iInvited
                ? "Invite already sent"
                : null;
              return (
                <li key={username} className={styles.friendItem}>
                  {/* Photo + name both link to the profile (photo not expandable). */}
                  <Link to={profilePath(username)} className={styles.friendIdentity}>
                    <Avatar username={username} pictureUrl={pictureUrl} size={36} />
                    <span className={styles.friendText}>
                      <span className={styles.friendName}>{username}</span>
                      {note && <small className={styles.friendNote}>{note}</small>}
                      {err && <small className={styles.error}>{err}</small>}
                    </span>
                  </Link>
                  <button
                    className={styles.friendInviteBtn}
                    onClick={() => handleSend(username)}
                    disabled={disabled || sending === username}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.modalFooter}>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
