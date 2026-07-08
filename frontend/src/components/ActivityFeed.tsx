import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { getFeed, type FeedCategory, type FeedItem } from "../api/home";
import { formatDate } from "../lib/date";
import { profilePath } from "../lib/paths";
import { Avatar } from "./Avatar";
import { CommentIcon, PeopleIcon, StarIcon } from "./Icons";
import { Alert } from "./Alert";
import { LoadingState } from "./Spinner";
import styles from "./ActivityFeed.module.css";

const CATEGORIES: { value: FeedCategory; label: string; Icon: typeof StarIcon }[] = [
  { value: "ratings", label: "Ratings", Icon: StarIcon },
  { value: "comments", label: "Comments", Icon: CommentIcon },
  { value: "friends", label: "Friends", Icon: PeopleIcon },
];

export function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which categories are shown. All on by default; toggling refetches.
  const [selected, setSelected] = useState<Set<FeedCategory>>(
    () => new Set(CATEGORIES.map((c) => c.value)),
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const noneSelected = selected.size === 0;
  // `types` for the API: only sent when a strict subset is active — all-selected
  // omits it so the backend returns every category. `selected` is a stable
  // reference that changes only on toggle, so callbacks keying on it stay stable.
  const typesFor = (s: Set<FeedCategory>): FeedCategory[] | undefined =>
    s.size === CATEGORIES.length ? undefined : [...s];

  useEffect(() => {
    if (selected.size === 0) {
      setItems([]);
      setNextBefore(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    setError(null);
    getFeed(null, undefined, typesFor(selected))
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextBefore(page.next_before);
      })
      .catch(() => !cancelled && setError("Could not load your activity."));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const toggleCategory = useCallback((value: FeedCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFeed(nextBefore, undefined, typesFor(selected));
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextBefore(page.next_before);
    } catch {
      setError("Could not load more activity.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore, selected]);

  // Twitter-style: auto-load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextBefore || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextBefore, loadMore]);

  return (
    <>
      <div className={styles.filterBar} role="group" aria-label="Filter activity by type">
        <span className={styles.filterLabel}>Show</span>
        {CATEGORIES.map(({ value, label, Icon }) => {
          const on = selected.has(value);
          return (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${on ? styles.chipOn : ""}`}
              aria-pressed={on}
              onClick={() => toggleCategory(value)}
            >
              <Icon size={14} className={styles.chipIcon} />
              {label}
            </button>
          );
        })}
      </div>
      <FeedBody
        items={items}
        error={error}
        nextBefore={nextBefore}
        loadingMore={loadingMore}
        loadMore={loadMore}
        sentinelRef={sentinelRef}
        noneSelected={noneSelected}
      />
    </>
  );
}

/** Human-friendly bucket label for the timeline group headers, e.g. "Today",
 *  "Yesterday", "This week", or "June 2026" for older items. */
function groupLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Earlier";
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth()
  ) {
    return "Earlier this month";
  }
  return then.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Split items (already newest-first) into consecutive groups by bucket label. */
function groupItems(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const groups: { label: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const label = groupLabel(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function FeedBody({
  items,
  error,
  nextBefore,
  loadingMore,
  loadMore,
  sentinelRef,
  noneSelected,
}: {
  items: FeedItem[] | null;
  error: string | null;
  nextBefore: string | null;
  loadingMore: boolean;
  loadMore: () => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
  noneSelected: boolean;
}) {
  if (noneSelected) {
    return <div className={styles.empty}>Pick at least one activity type above.</div>;
  }
  if (error && !items) return <Alert>{error}</Alert>;
  if (items === null) return <LoadingState />;
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        No activity yet. <Link to="/friends">Add a friend</Link> or rate an album to
        get your timeline going.
      </div>
    );
  }

  return (
    <div className={styles.feed}>
      {groupItems(items).map((group) => (
        <section key={group.label} className={styles.group}>
          <h3 className={styles.groupHeader}>{group.label}</h3>
          <div className={styles.timeline}>
            {group.items.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
      {error && <Alert>{error}</Alert>}
      {nextBefore && (
        <>
          <div ref={sentinelRef} aria-hidden />
          <button className={styles.loadMore} onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older activity"}
          </button>
        </>
      )}
    </div>
  );
}

function AlbumLink({ album }: { album: NonNullable<FeedItem["album"]> }) {
  return (
    <Link to={`/albums/${album.spotify_id}`} className={styles.link}>
      {album.title}
    </Link>
  );
}

function ActorLink({ actor }: { actor: FeedItem["actor"] }) {
  return (
    <Link to={profilePath(actor.username)} className={styles.link}>
      {actor.display_name}
    </Link>
  );
}

/** Visual kind of an event → the type badge's icon + color accent. */
function eventKind(type: FeedItem["type"]): {
  Icon: typeof StarIcon;
  badgeClass: string;
} {
  if (type === "new_friend") return { Icon: PeopleIcon, badgeClass: styles.badgeFriend };
  if (type.endsWith("commented")) return { Icon: CommentIcon, badgeClass: styles.badgeComment };
  return { Icon: StarIcon, badgeClass: styles.badgeRating };
}

function FeedRow({ item }: { item: FeedItem }) {
  const { Icon, badgeClass } = eventKind(item.type);
  const isRating = item.type === "you_rated" || item.type === "friend_rated";

  return (
    <article className={styles.row}>
      <span className={styles.anchor}>
        <Avatar
          username={item.actor.username}
          pictureUrl={item.actor.picture_url}
          displayName={item.actor.display_name}
          size={40}
        />
        <span className={`${styles.typeBadge} ${badgeClass}`} aria-hidden>
          <Icon size={12} />
        </span>
      </span>

      <div className={styles.body}>
        <span className={styles.text}>
          <Sentence item={item} />
          {isRating && item.score != null && (
            <span
              className={styles.score}
              aria-label={`Score ${item.score.toFixed(1)} out of 10`}
            >
              <span className={styles.scoreValue}>{item.score.toFixed(1)}</span>
              <span className={styles.scoreOut}>/10</span>
            </span>
          )}
        </span>
        {item.excerpt && <p className={styles.excerpt}>“{item.excerpt}”</p>}
        <span className={styles.date}>{formatDate(item.created_at)}</span>
      </div>
    </article>
  );
}

function Sentence({ item }: { item: FeedItem }) {
  switch (item.type) {
    case "you_rated":
      return <>You rated {item.album && <AlbumLink album={item.album} />}</>;
    case "friend_rated":
      return (
        <>
          <ActorLink actor={item.actor} /> rated {item.album && <AlbumLink album={item.album} />}
        </>
      );
    case "you_commented":
      return <>You commented on {item.album && <AlbumLink album={item.album} />}</>;
    case "friend_commented":
      return (
        <>
          <ActorLink actor={item.actor} /> commented on{" "}
          {item.album && <AlbumLink album={item.album} />}
        </>
      );
    case "new_friend":
      return (
        <>
          You and <ActorLink actor={item.actor} /> are now friends
        </>
      );
  }
}
