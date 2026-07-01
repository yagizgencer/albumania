import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getFeed, type FeedItem } from "../api/home";
import { formatDate } from "../lib/date";
import { Avatar } from "./Avatar";
import { ScoreMeter } from "./ScoreMeter";
import { CommentIcon, PeopleIcon, StarIcon } from "./Icons";
import { Alert } from "./Alert";
import { LoadingState } from "./Spinner";
import styles from "./ActivityFeed.module.css";

export function ActivityFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFeed()
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNextBefore(page.next_before);
      })
      .catch(() => !cancelled && setError("Could not load your activity."));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFeed(nextBefore);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setNextBefore(page.next_before);
    } catch {
      setError("Could not load more activity.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore]);

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
      {items.map((item) => (
        <FeedRow key={item.id} item={item} />
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
    <Link to={`/profile/${actor.username}`} className={styles.link}>
      {actor.display_name}
    </Link>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const Icon =
    item.type === "new_friend" ? PeopleIcon : item.type.endsWith("commented") ? CommentIcon : StarIcon;

  return (
    <article className={styles.row}>
      <span className={styles.avatarCol}>
        <Avatar
          username={item.actor.username}
          pictureUrl={item.actor.picture_url}
          displayName={item.actor.display_name}
          size={40}
        />
        <span className={styles.typeBadge} aria-hidden>
          <Icon size={12} />
        </span>
      </span>

      <div className={styles.body}>
        <div className={styles.line}>
          <span className={styles.text}>
            <Sentence item={item} />
          </span>
          <span className={styles.date}>{formatDate(item.created_at)}</span>
        </div>
        {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
      </div>
    </article>
  );
}

function Sentence({ item }: { item: FeedItem }) {
  switch (item.type) {
    case "you_rated":
      return (
        <>
          You rated {item.album && <AlbumLink album={item.album} />}{" "}
          {item.score != null && <ScoreMeter score={item.score} />}
        </>
      );
    case "friend_rated":
      return (
        <>
          <ActorLink actor={item.actor} /> rated {item.album && <AlbumLink album={item.album} />}{" "}
          {item.score != null && <ScoreMeter score={item.score} />}
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
