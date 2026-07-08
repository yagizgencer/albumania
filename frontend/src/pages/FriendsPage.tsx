import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { PageContainer } from "../components/PageContainer";
import { Button } from "../components/Button";
import { ConfirmButton } from "../components/ConfirmButton";
import { Card } from "../components/Card";
import {
  SearchIcon,
  PeopleIcon,
  InboxIcon,
  PaperPlaneIcon,
} from "../components/Icons";
import { getErrorMessage } from "../lib/apiError";
import { profilePath } from "../lib/paths";
import styles from "./FriendsPage.module.css";

type Tab = "friends" | "incoming" | "outgoing";

const TABS: { value: Tab; label: string; count: (d: FriendshipList | null) => number }[] = [
  { value: "friends", label: "Friends", count: (d) => d?.accepted.length ?? 0 },
  { value: "incoming", label: "Incoming", count: (d) => d?.incoming.length ?? 0 },
  { value: "outgoing", label: "Outgoing", count: (d) => d?.outgoing.length ?? 0 },
];

const TAB_VALUES = TABS.map((t) => t.value);

export function FriendsPage() {
  const { username } = useAuth();
  // Drive the active tab from the URL so notifications can deep-link
  // (e.g. /friends?tab=incoming).
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = TAB_VALUES.includes(tabParam as Tab) ? (tabParam as Tab) : "friends";
  const setTab = (next: Tab) =>
    setSearchParams(next === "friends" ? {} : { tab: next }, { replace: true });

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
  const friendCount = data?.accepted.length ?? 0;

  return (
    <PageContainer>
      <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Friends</h1>
        <p className={styles.subtitle}>
          {friendCount === 0
            ? "Find people and grow your circle."
            : `You have ${friendCount} friend${friendCount === 1 ? "" : "s"}.`}
        </p>
      </div>

      <div className={styles.search} ref={searchWrapRef}>
        <div className={styles.searchField}>
          <span className={styles.searchIcon}>
            <SearchIcon size={18} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search people by username or display name…"
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
            {results.map((u) => (
              <div key={u.username} className={styles.resultRow}>
                {/* The whole row opens the profile: this link's ::after stretches
                    over the entire row (see .stretchLink). The action buttons
                    below sit above it via z-index so they stay clickable. */}
                <Link
                  to={profilePath(u.username)}
                  className={`${styles.userInline} ${styles.stretchLink}`}
                  aria-label={`Open ${u.display_name}'s profile`}
                >
                  <Avatar
                    username={u.username}
                    pictureUrl={u.profile_picture_url}
                    displayName={u.display_name}
                    size={36}
                  />
                  <span className={styles.userText}>
                    <span className={styles.userLink}>{u.display_name}</span>
                    <span className={styles.userHandle}>{u.username}</span>
                  </span>
                  {u.profile_visibility !== "public" && (
                    <span className={styles.privatePill} title="Visible to friends only">
                      🔒 Friends
                    </span>
                  )}
                </Link>
                {(() => {
                  const s = searchState(u.username);
                  if (s.kind === "friends")
                    return <span className={styles.resultStatus}>Friends</span>;
                  if (s.kind === "requested")
                    return <span className={styles.resultStatus}>Requested</span>;
                  if (s.kind === "incoming")
                    return (
                      <div className={styles.rowActions}>
                        <Button intent="success" size="sm" onClick={() => onAccept(s.id)}>
                          Accept
                        </Button>
                        <Button intent="secondary" size="sm" onClick={() => onDecline(s.id)}>
                          Decline
                        </Button>
                      </div>
                    );
                  return (
                    <Button size="sm" onClick={() => onSend(u.username)}>
                      Add
                    </Button>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Friend lists">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={`${styles.tab} ${tab === t.value ? styles.tabActive : ""}`}
            onClick={() => setTab(t.value)}
          >
            {t.label} <span className={styles.tabCount}>{t.count(data)}</span>
          </button>
        ))}
      </div>

      {error && <Alert>{error}</Alert>}
      {!data && !error && <LoadingState />}

      {data && tab === "friends" && (
        <FriendList
          items={data.accepted}
          emptyIcon={<PeopleIcon size={44} />}
          emptyText="No friends yet — search above to add some."
          render={(f) => (
            <FriendRow
              key={f.id}
              username={otherUsername(f)}
              pictureUrl={otherPictureUrl(f)}
              actions={
                <ConfirmButton
                  label="Unfriend"
                  prompt={`Unfriend ${otherUsername(f)}?`}
                  confirmLabel="Yes, unfriend"
                  onConfirm={() => onRemove(f.id)}
                  title="Unfriend"
                />
              }
            />
          )}
        />
      )}

      {data && tab === "incoming" && (
        <FriendList
          items={data.incoming}
          emptyIcon={<InboxIcon size={44} />}
          emptyText="No incoming requests."
          render={(f) => (
            <FriendRow
              key={f.id}
              username={f.requested_by}
              pictureUrl={f.requested_by_picture_url}
              actions={
                <>
                  <Button intent="success" size="sm" onClick={() => onAccept(f.id)}>
                    Accept
                  </Button>
                  <Button intent="secondary" size="sm" onClick={() => onDecline(f.id)}>
                    Decline
                  </Button>
                </>
              }
            />
          )}
        />
      )}

      {data && tab === "outgoing" && (
        <FriendList
          items={data.outgoing}
          emptyIcon={<PaperPlaneIcon size={44} />}
          emptyText="No outgoing requests."
          render={(f) => (
            <FriendRow
              key={f.id}
              username={otherUsername(f)}
              pictureUrl={otherPictureUrl(f)}
              actions={
                <Button intent="danger" size="sm" onClick={() => onRemove(f.id)}>
                  Cancel
                </Button>
              }
            />
          )}
        />
      )}
      </div>
    </PageContainer>
  );
}

function FriendRow({
  username,
  pictureUrl,
  actions,
}: {
  username: string;
  pictureUrl: string | null;
  actions: React.ReactNode;
}) {
  return (
    <Card pad="sm" className={styles.row}>
      <Link to={profilePath(username)} className={styles.rowAvatar} aria-label={username}>
        <Avatar username={username} pictureUrl={pictureUrl} size={44} />
      </Link>
      <Link to={profilePath(username)} className={styles.rowName}>
        {username}
      </Link>
      <div className={styles.rowActions}>{actions}</div>
    </Card>
  );
}

interface FriendListProps {
  items: Friendship[];
  emptyIcon: React.ReactNode;
  emptyText: string;
  render: (f: Friendship) => React.ReactNode;
}

function FriendList({ items, emptyIcon, emptyText, render }: FriendListProps) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden>
          {emptyIcon}
        </span>
        <p>{emptyText}</p>
      </div>
    );
  }
  return <div className={styles.list}>{items.map(render)}</div>;
}
