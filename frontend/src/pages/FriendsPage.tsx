import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Friendship,
  FriendshipList,
  UserSearchResult,
  acceptFriendship,
  declineFriendship,
  deleteFriendship,
  listFriendships,
  searchUsers,
  sendFriendRequest,
} from "../api/friendships";
import { Avatar } from "../components/Avatar";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import {
  CheckIcon,
  CloseIcon,
  LockIcon,
  PeopleIcon,
  SearchIcon,
  TrashIcon,
  UserPlusIcon,
} from "../components/Icons";
import { getErrorMessage } from "../lib/apiError";
import { profilePath } from "../lib/paths";
import styles from "./FriendsPage.module.css";

export function FriendsPage() {
  const { username } = useAuth();

  const [data, setData] = useState<FriendshipList | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live search state (mirrors the top-nav TopSearch: debounced, no submit).
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);

  async function refresh() {
    try {
      setData(await listFriendships());
    } catch {
      setError("Could not load friendships");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Debounced live search — fires as the user types, cancels on each keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      setSearchError(null);
      try {
        setResults(await searchUsers(q));
      } catch {
        setSearchError("Search failed");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close the search panel on outside click / Escape.
  useEffect(() => {
    if (!searchOpen) return;
    function onDoc(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  async function onSend(target: string) {
    try {
      await sendFriendRequest(target);
      // Keep the user in the results — refreshing the friendship list makes the
      // row re-derive to "Requested" (see searchState) instead of vanishing.
      await refresh();
    } catch (err: unknown) {
      setSearchError(getErrorMessage(err, "Failed to send request"));
    }
  }

  async function onAccept(id: number) {
    await acceptFriendship(id);
    await refresh();
  }

  async function onDecline(id: number) {
    await declineFriendship(id);
    await refresh();
  }

  async function onRemove(id: number) {
    await deleteFriendship(id);
    await refresh();
  }

  // Friendship state for a searched user, derived from the already-loaded lists
  // (no extra API call). Drives which action a search-result row shows.
  type SearchState =
    | { kind: "none" }
    | { kind: "requested" } // I sent them a request
    | { kind: "incoming"; id: number } // they sent me a request
    | { kind: "friends" };
  function searchState(target: string): SearchState {
    if (!data) return { kind: "none" };
    if (data.accepted.some((f) => otherUsername(f) === target)) return { kind: "friends" };
    const incoming = data.incoming.find((f) => f.requested_by === target);
    if (incoming) return { kind: "incoming", id: incoming.id };
    if (data.outgoing.some((f) => otherUsername(f) === target)) return { kind: "requested" };
    return { kind: "none" };
  }

  function otherUsername(f: Friendship): string {
    return f.user_a_username === username ? f.user_b_username : f.user_a_username;
  }

  function otherPictureUrl(f: Friendship): string | null {
    return f.user_a_username === username ? f.user_b_picture_url : f.user_a_picture_url;
  }

  const showPanel = searchOpen && query.trim().length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Friends</h1>
      </div>

      {/* Prominent full-width people search with a dropdown of results. */}
      <div className={styles.search} ref={searchWrapRef}>
        <div className={styles.searchBar}>
          <SearchIcon size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Find people by username or display name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            aria-label="Search people"
          />
        </div>

        {showPanel && (
          <div className={styles.searchPanel}>
            {searching && <p className={styles.searchStatus}>Searching…</p>}
            {searchError && <Alert>{searchError}</Alert>}
            {!searching && !searchError && results.length === 0 && (
              <p className={styles.searchStatus}>No people found.</p>
            )}
            {results.map((u) => {
              const s = searchState(u.username);
              return (
                <div key={u.username} className={styles.resultRow}>
                  <Link
                    to={profilePath(u.username)}
                    className={styles.userInline}
                    aria-label={`Open ${u.display_name}'s profile`}
                  >
                    <Avatar
                      username={u.username}
                      pictureUrl={u.profile_picture_url}
                      displayName={u.display_name}
                      size={36}
                    />
                    <span className={styles.userText}>
                      <span className={styles.userName}>{u.display_name}</span>
                      <span className={styles.userHandle}>@{u.username}</span>
                    </span>
                  </Link>
                  {u.profile_visibility !== "public" && (
                    <span className={styles.privatePill} title="Visible to friends only">
                      <LockIcon size={11} />
                      Friends
                    </span>
                  )}
                  {s.kind === "friends" ? (
                    <span className={styles.resultStatus}>Friends</span>
                  ) : s.kind === "requested" ? (
                    <span className={styles.resultStatus}>Requested</span>
                  ) : s.kind === "incoming" ? (
                    <span className={styles.rowActions}>
                      <IconButton kind="accept" tipPos="left" tip="Accept" onClick={() => onAccept(s.id)}>
                        <CheckIcon size={18} />
                      </IconButton>
                      <IconButton kind="decline" tipPos="left" tip="Decline" onClick={() => onDecline(s.id)}>
                        <CloseIcon size={18} />
                      </IconButton>
                    </span>
                  ) : (
                    <IconButton kind="add" tipPos="left" tip="Add friend" onClick={() => onSend(u.username)}>
                      <UserPlusIcon size={19} />
                    </IconButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {!data && !error && <LoadingState />}

      {data && (
        <div className={styles.split}>
          <aside className={styles.rail}>
            <RequestBox title="Incoming" count={data.incoming.length} empty="No incoming requests.">
              {data.incoming.map((f) => (
                <RequestRow
                  key={f.id}
                  username={f.requested_by}
                  pictureUrl={f.requested_by_picture_url}
                  actions={
                    <>
                      <IconButton kind="accept" small tipPos="left" tip="Accept" onClick={() => onAccept(f.id)}>
                        <CheckIcon size={16} />
                      </IconButton>
                      <IconButton kind="decline" small tipPos="left" tip="Decline" onClick={() => onDecline(f.id)}>
                        <CloseIcon size={16} />
                      </IconButton>
                    </>
                  }
                />
              ))}
            </RequestBox>

            <RequestBox title="Outgoing" count={data.outgoing.length} empty="Nothing pending.">
              {data.outgoing.map((f) => (
                <RequestRow
                  key={f.id}
                  username={otherUsername(f)}
                  pictureUrl={otherPictureUrl(f)}
                  actions={
                    <IconButton kind="decline" small tipPos="left" tip="Cancel" onClick={() => onRemove(f.id)}>
                      <CloseIcon size={16} />
                    </IconButton>
                  }
                />
              ))}
            </RequestBox>
          </aside>

          <section>
            <h2 className={styles.sectionTitle}>
              Your friends{" "}
              <span className={styles.friendsCount}>({data.accepted.length})</span>
            </h2>
            {data.accepted.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon} aria-hidden>
                  <PeopleIcon size={44} />
                </span>
                <p>No friends yet — search above to add some.</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {data.accepted.map((f) => (
                  <FriendCard
                    key={f.id}
                    username={otherUsername(f)}
                    pictureUrl={otherPictureUrl(f)}
                    onUnfriend={() => onRemove(f.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function IconButton({
  kind,
  tip,
  tipPos,
  small,
  onClick,
  disabled,
  children,
}: {
  kind: "add" | "accept" | "decline" | "remove";
  tip: string;
  /** Tooltip side — "left" for buttons inside scrollable panels (search results,
   *  request lists) so the chip isn't clipped by the container's overflow. */
  tipPos?: "left";
  small?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const kindClass =
    kind === "add" || kind === "accept"
      ? styles.iconAccept
      : styles.iconRemove; // decline / cancel / remove share the clay-red look
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${small ? styles.iconBtnSm : ""} ${kindClass}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={tip}
      data-tip={tip}
      data-tip-pos={tipPos}
    >
      {children}
    </button>
  );
}

function RequestBox({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.tbox}>
      <div className={styles.tboxHead}>
        <span className={styles.tboxTitle}>{title}</span>
        {count > 0 && <span className={styles.tboxCount}>{count}</span>}
      </div>
      <div className={styles.tlist}>
        {count === 0 ? <p className={styles.emptyLine}>{empty}</p> : children}
      </div>
    </section>
  );
}

function RequestRow({
  username,
  pictureUrl,
  actions,
}: {
  username: string;
  pictureUrl: string | null;
  actions: React.ReactNode;
}) {
  return (
    <div className={styles.tRow}>
      <Link to={profilePath(username)} className={styles.tRowAvatar} aria-hidden tabIndex={-1}>
        <Avatar username={username} pictureUrl={pictureUrl} size={38} />
      </Link>
      <Link to={profilePath(username)} className={styles.tRowName}>
        {username}
      </Link>
      <span className={styles.tRowActions}>{actions}</span>
    </div>
  );
}

function FriendCard({
  username,
  pictureUrl,
  onUnfriend,
}: {
  username: string;
  pictureUrl: string | null;
  onUnfriend: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await onUnfriend();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={styles.fcard}>
      <Link to={profilePath(username)} className={styles.fcardAvatar} aria-hidden tabIndex={-1}>
        <Avatar username={username} pictureUrl={pictureUrl} size={72} />
      </Link>
      <Link to={profilePath(username)} className={styles.fname}>
        {username}
      </Link>
      <div className={styles.fcardActions}>
        {confirming ? (
          <>
            <span className={styles.confirmText}>Unfriend?</span>
            <IconButton kind="remove" tip="Yes, unfriend" onClick={run} disabled={busy}>
              <CheckIcon size={18} />
            </IconButton>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconCancel}`}
              onClick={() => setConfirming(false)}
              disabled={busy}
              aria-label="Keep friend"
              data-tip="Keep"
            >
              <CloseIcon size={18} />
            </button>
          </>
        ) : (
          <IconButton kind="remove" tip="Unfriend" onClick={() => setConfirming(true)}>
            <TrashIcon size={19} />
          </IconButton>
        )}
      </div>
    </article>
  );
}
