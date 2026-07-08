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
import {
  ChevronDownIcon,
  DiscIcon,
  ExternalLinkIcon,
  HeadphonesIcon,
  HourglassIcon,
  PaperPlaneIcon,
  PeopleIcon,
  SearchIcon,
  SpotifyIcon,
  StarIcon,
  TrashIcon,
} from "../components/Icons";
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
    setBusy(true); setActionError(null);
    try {
      const r = await createRating(album.id);
      setRating(r);
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
    setBusy(true); setActionError(null);
    try {
      await deleteRating(rating.id);
      setRating(null);
      setConfirmingRemove(false);
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

  // Owner actions for the top-right icon bar, in one fixed intrinsic order
  // (listen → rate → invite → remove). Only the ones valid for the current state
  // render; the rest are omitted. Layout is otherwise identical across states.
  const iconActions = [
    {
      key: "listen",
      show: !isPublished && !rating && !hasActiveInvite,
      className: styles.iconListen,
      tip: "Listen Later",
      icon: <HeadphonesIcon size={26} />,
      onClick: handleAddToListenLater,
      disabled: busy || !rateable,
    },
    {
      key: "rate",
      show: !isPublished,
      className: styles.iconRate,
      tip: "Rate",
      icon: <StarIcon size={26} />,
      onClick: handleRate,
      disabled: busy || !rateable,
    },
    {
      key: "invite",
      show: true,
      className: styles.iconInvite,
      tip: "Invite a friend",
      icon: <PaperPlaneIcon size={26} />,
      onClick: () => { setInviteModalOpen(true); setActionError(null); },
      disabled: busy || !rateable,
    },
    {
      key: "remove",
      show: isPublished,
      className: styles.iconRemove,
      tip: "Remove rating",
      icon: <TrashIcon size={26} />,
      onClick: () => { setConfirmingRemove(true); setActionError(null); },
      disabled: busy,
    },
  ].filter((a) => a.show);

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
          {/* Title (+ Spotify pop-out) on the left; icon actions on the right,
              centred on the album-name line. Artist and metadata chips below. */}
          <div className={styles.headline}>
            <div className={styles.titleRow}>
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
                  <SpotifyIcon size={19} className={styles.spotifyMark} />
                </a>
              </h1>
              {/* Owner actions as indicative icon chips — the state-appropriate
                  ones only, in a fixed order. */}
              {iconActions.length > 0 && (
                <div className={styles.iconBar}>
                  {iconActions.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className={`${styles.iconBtn} ${a.className}`}
                      onClick={a.onClick}
                      disabled={a.disabled}
                      aria-label={a.tip}
                      data-tip={a.tip}
                    >
                      {a.icon}
                    </button>
                  ))}
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
            {/* Release date + runtime as quiet chips (track count lives in the
                Tracks toggle below). */}
            <div className={styles.metaChips}>
              <span className={styles.metaChip}>
                <DiscIcon size={14} className={styles.metaChipIcon} />
                <span className={styles.metaChipText}>{formatDate(album.release_date)}</span>
              </span>
              {hasAnyDuration && (
                <span className={styles.metaChip}>
                  <HourglassIcon size={14} className={styles.metaChipIcon} />
                  <span className={styles.metaChipText}>{formatDuration(totalMs)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Scores row: the labelled amber figures on the left, the compare
              searchbar on the right. Pushed to the bottom of the meta column. */}
          <div className={styles.stats}>
            {!rateable ? (
              // Un-rateable albums can't be rated/saved/shared, so no scores and
              // no compare — just the rule, in the scores' place.
              <p className={styles.noRatings}>{RATEABLE_RULE_TEXT}</p>
            ) : stats && stats.num_raters > 0 && stats.mean_score !== null ? (
              <div className={styles.statGroup}>
                <div className={styles.statItem}>
                  {/* Score pill with the rater count tucked on its corner as a
                      small badge (it belongs to this average, not a third stat). */}
                  <span className={styles.scoreChipWrap}>
                    <span className={styles.scoreChip}>
                      {stats.mean_score.toFixed(1)}
                      <span className={styles.scoreChipOut}>/10</span>
                    </span>
                    <span className={styles.statCount} title={`${stats.num_raters} ratings`}>
                      <PeopleIcon size={11} className={styles.statCountIcon} />
                      {stats.num_raters}
                    </span>
                  </span>
                  <span className={styles.statLabel}>Average score</span>
                </div>
                {/* Your score only when you've published one — no empty box. */}
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
            ) : (
              <p className={styles.noRatings}>No ratings for this album yet</p>
            )}

            {/* Shown for any rateable album (even with no friends yet) so the
                compare feature is discoverable; the dropdown explains when nobody
                has rated. The label differs by whether we've rated. */}
            {rateable && (
              <FriendRatingsPicker
                friends={friendRatings}
                onPick={handlePickFriend}
                placeholder={isPublished ? "Compare a friend…" : "See a friend's rating…"}
              />
            )}
          </div>

          {/* Inline confirm shown after the Remove icon is clicked. */}
          {isPublished && confirmingRemove && (
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
          )}

          {actionError && <Alert>{actionError}</Alert>}
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
          <span className={styles.tracksLabel}>
            Tracks <span className={styles.tracksCount}>({album.tracks.length})</span>
          </span>
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
          onSent={() => {
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
  placeholder,
}: {
  friends: AlbumFriendRating[];
  onPick: (friend: AlbumFriendRating) => void;
  placeholder: string;
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
    <div className={styles.friendRatings} ref={wrapRef} data-open={open}>
      {/* An always-on subtle searchbar (search icon · input · friend count ·
          chevron). Click and type to filter; picking a friend opens the compare. */}
      <div className={styles.searchBar} onClick={() => setOpen(true)}>
        <SearchIcon size={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="album-friend-ratings-list"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        <span
          className={styles.friendCount}
          title={`${friends.length} friend${friends.length === 1 ? "" : "s"} rated this album`}
        >
          <PeopleIcon size={11} className={styles.statCountIcon} />
          {friends.length}
        </span>
        <ChevronDownIcon size={17} className={styles.searchChevron} />
      </div>
      {open && (
        <ul
          id="album-friend-ratings-list"
          role="listbox"
          className={styles.comboList}
        >
          {filtered.length === 0 ? (
            <li className={styles.comboEmpty}>
              {friends.length === 0
                ? "None of your friends have rated this yet."
                : "No matches"}
            </li>
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
                <Avatar
                  username={f.username}
                  pictureUrl={f.profile_picture_url}
                  displayName={f.display_name}
                  size={32}
                />
                <span className={styles.comboText}>
                  <span className={styles.comboName}>{f.display_name}</span>
                  <span className={styles.comboUser}>@{f.username}</span>
                </span>
                {f.score != null && (
                  <span className={styles.friendScore}>
                    {f.score.toFixed(1)}
                    <span className={styles.friendScoreOut}>/10</span>
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
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
