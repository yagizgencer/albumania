import { useEffect, useState } from "react";
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
import styles from "./FriendsPage.module.css";

type Tab = "friends" | "incoming" | "outgoing";

export function FriendsPage() {
  const { username } = useAuth();
  const [tab, setTab] = useState<Tab>("friends");
  const [data, setData] = useState<FriendshipList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    try {
      setResults(await searchUsers(query.trim()));
    } catch {
      setSearchError("Search failed");
    }
  }

  async function onSend(target: string) {
    try {
      await sendFriendRequest(target);
      await refresh();
      setResults((prev) => prev.filter((u) => u.username !== target));
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail ?? "Failed to send request";
      setSearchError(detail);
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

  function otherUsername(f: Friendship): string {
    return f.user_a_username === username ? f.user_b_username : f.user_a_username;
  }

  function otherPictureUrl(f: Friendship): string | null {
    return f.user_a_username === username ? f.user_b_picture_url : f.user_a_picture_url;
  }

  return (
    <main>
      <h1>Friends</h1>

      <form className={styles.searchBar} onSubmit={onSearch}>
        <input
          placeholder="Search by username or display name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {searchError && <p className={styles.error}>{searchError}</p>}

      {results.length > 0 && (
        <div className={styles.searchResults}>
          {results.map((u) => (
            <div key={u.username} className={styles.searchResult}>
              <span className={styles.userInline}>
                <Avatar
                  username={u.username}
                  pictureUrl={u.profile_picture_url}
                  displayName={u.display_name}
                  size={28}
                />
                <Link to={`/profile/${u.username}`} className={styles.userLink}>{u.display_name}</Link>{" "}
                <small className={styles.userHandle}>{u.username}</small>
              </span>
              <button onClick={() => onSend(u.username)}>Add friend</button>
            </div>
          ))}
        </div>
      )}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "friends" ? styles.active : ""}`}
          onClick={() => setTab("friends")}
        >
          Friends ({data?.accepted.length ?? 0})
        </button>
        <button
          className={`${styles.tab} ${tab === "incoming" ? styles.active : ""}`}
          onClick={() => setTab("incoming")}
        >
          Incoming ({data?.incoming.length ?? 0})
        </button>
        <button
          className={`${styles.tab} ${tab === "outgoing" ? styles.active : ""}`}
          onClick={() => setTab("outgoing")}
        >
          Outgoing ({data?.outgoing.length ?? 0})
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!data && !error && <p>Loading…</p>}

      {data && tab === "friends" && (
        <FriendList
          items={data.accepted}
          emptyText="No friends yet."
          render={(f) => (
            <div key={f.id} className={styles.card}>
              <span className={styles.userInline}>
                <Avatar
                  username={otherUsername(f)}
                  pictureUrl={otherPictureUrl(f)}
                  size={28}
                />
                <Link to={`/profile/${otherUsername(f)}`} className={styles.userLink}>{otherUsername(f)}</Link>
              </span>
              <div className={styles.actions}>
                <button className={styles.danger} onClick={() => onRemove(f.id)}>
                  Unfriend
                </button>
              </div>
            </div>
          )}
        />
      )}

      {data && tab === "incoming" && (
        <FriendList
          items={data.incoming}
          emptyText="No incoming requests."
          render={(f) => (
            <div key={f.id} className={styles.card}>
              <span className={styles.userInline}>
                <Avatar
                  username={f.requested_by}
                  pictureUrl={f.requested_by_picture_url}
                  size={28}
                />
                <Link to={`/profile/${f.requested_by}`} className={styles.userLink}>{f.requested_by}</Link>
              </span>
              <div className={styles.actions}>
                <button className={styles.primary} onClick={() => onAccept(f.id)}>
                  Accept
                </button>
                <button onClick={() => onDecline(f.id)}>Decline</button>
              </div>
            </div>
          )}
        />
      )}

      {data && tab === "outgoing" && (
        <FriendList
          items={data.outgoing}
          emptyText="No outgoing requests."
          render={(f) => (
            <div key={f.id} className={styles.card}>
              <span className={styles.userInline}>
                <Avatar
                  username={otherUsername(f)}
                  pictureUrl={otherPictureUrl(f)}
                  size={28}
                />
                <Link to={`/profile/${otherUsername(f)}`} className={styles.userLink}>{otherUsername(f)}</Link>
              </span>
              <div className={styles.actions}>
                <button className={styles.danger} onClick={() => onRemove(f.id)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        />
      )}
    </main>
  );
}

interface FriendListProps {
  items: Friendship[];
  emptyText: string;
  render: (f: Friendship) => React.ReactNode;
}

function FriendList({ items, emptyText, render }: FriendListProps) {
  if (items.length === 0) return <p className={styles.empty}>{emptyText}</p>;
  return <div>{items.map(render)}</div>;
}
