import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  listNotifications,
  type NotificationItem,
  type NotificationType,
} from "../api/notifications";
import { useNotifications } from "../context/NotificationsContext";
import { Avatar } from "./Avatar";
import { BellIcon, ThumbUpIcon } from "./Icons";
import styles from "./NavBar.module.css";

const LABELS: Record<NotificationType, (actor: string) => string> = {
  friend_request: (actor) => `${actor} sent you a friend request`,
  friend_accept: (actor) => `${actor} accepted your friend request`,
  listen_invite: (actor) => `${actor} invited you to listen`,
  friend_published: (actor) => `${actor} finished rating an album you're both listening to`,
  // Likes are anonymous — no actor is shown; the album meta line names the album.
  comment_liked: () => "Someone liked your comment",
};

export function NotificationBell() {
  const { summary, markSeen, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Mark-seen the moment the panel opens. Refresh badges (they should now be 0).
    if (summary.bell > 0) {
      await markSeen("bell");
    }
    try {
      setItems(await listNotifications());
    } catch {
      setItems([]);
    }
    void refresh();
  }

  return (
    <div className={styles.bellWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.item}
        onClick={handleToggle}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <span className={styles.itemIcon}>
          <BellIcon size={30} />
          {summary.bell > 0 && (
            <span className={styles.badge}>
              {summary.bell > 99 ? "99+" : summary.bell}
            </span>
          )}
        </span>
        <span className={styles.itemLabel}>Notifications</span>
      </button>

      {open && (
        <div className={styles.bellPanel} role="dialog" aria-label="Notifications">
          <div className={styles.bellHeader}>Notifications</div>
          {items === null ? (
            <div className={styles.bellEmpty}>Loading…</div>
          ) : items.length === 0 ? (
            <div className={styles.bellEmpty}>You're all caught up.</div>
          ) : (
            items.map((n) => <BellItem key={n.id} item={n} onNavigate={() => setOpen(false)} />)
          )}
        </div>
      )}
    </div>
  );
}

function BellItem({
  item,
  onNavigate,
}: {
  item: NotificationItem;
  onNavigate: () => void;
}) {
  const actor = item.actor_username ?? "Someone";
  const target = linkFor(item);
  const label = LABELS[item.type](actor);
  return (
    <Link
      to={target}
      className={`${styles.bellItem} ${item.read ? "" : styles.bellItemUnread}`}
      onClick={onNavigate}
    >
      {item.type === "comment_liked" ? (
        <span className={styles.bellLikeIcon} aria-hidden>
          <ThumbUpIcon size={20} />
        </span>
      ) : (
        <Avatar username={actor} pictureUrl={item.actor_picture_url} size={36} />
      )}
      <div className={styles.bellItemBody}>
        <div>{label}</div>
        {item.album && (
          <div className={styles.bellItemMeta}>
            {item.album.title} · {item.album.artist}
          </div>
        )}
      </div>
    </Link>
  );
}

function linkFor(item: NotificationItem): string {
  switch (item.type) {
    case "friend_request":
      return "/friends?tab=incoming";
    case "friend_accept":
      return "/friends";
    case "listen_invite":
      return "/listen-later";
    case "friend_published":
      return item.album ? `/albums/${item.album.spotify_id}` : "/listen-later";
    case "comment_liked":
      return item.album ? `/albums/${item.album.spotify_id}` : "/";
  }
}
