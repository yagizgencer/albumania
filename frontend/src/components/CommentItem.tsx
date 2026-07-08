import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import {
  deleteComment,
  reactToComment,
  updateComment,
  type Comment,
} from "../api/comments";
import { formatDate } from "../lib/date";
import { profilePath } from "../lib/paths";
import { Avatar } from "./Avatar";
import { CommentComposer } from "./CommentComposer";
import { MoreIcon, PencilIcon, ThumbDownIcon, ThumbUpIcon, TrashIcon, UserIcon } from "./Icons";
import styles from "./CommentItem.module.css";

interface CommentItemProps {
  comment: Comment;
  onUpdated: (comment: Comment) => void;
  onDeleted: (id: number) => void;
}

export function CommentItem({ comment, onUpdated, onDeleted }: CommentItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  // Close the "…" menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Decide whether the "Show more" toggle is needed (text exceeds ~10 lines).
  useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [comment.text, expanded, editing]);

  async function react(target: "up" | "down") {
    const value = comment.viewer_reaction === target ? "none" : target;
    const res = await reactToComment(comment.id, value);
    onUpdated({
      ...comment,
      likes: res.likes,
      dislikes: res.dislikes,
      viewer_reaction: res.viewer_reaction,
    });
  }

  async function handleEdit(text: string, visibility: Comment["visibility"]) {
    setBusy(true);
    try {
      const updated = await updateComment(comment.id, { text, visibility });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteComment(comment.id);
      onDeleted(comment.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`${styles.item} ${menuOpen ? styles.itemMenuOpen : ""}`}>
      <div className={styles.header}>
        {comment.author ? (
          <Link to={profilePath(comment.author.username)} className={styles.authorLink}>
            <Avatar
              username={comment.author.username}
              pictureUrl={comment.author.picture_url}
              displayName={comment.author.display_name}
              size={32}
            />
            <span className={styles.authorName}>{comment.author.display_name}</span>
          </Link>
        ) : (
          <span className={styles.author}>
            <span className={styles.anonAvatar} aria-hidden>
              <UserIcon size={20} />
            </span>
            <span className={styles.authorName}>Anonymous</span>
          </span>
        )}
        <span className={styles.meta}>
          {formatDate(comment.created_at)}
          {comment.edited_at && <span className={styles.edited}> (edited)</span>}
        </span>
      </div>

      {editing ? (
        <CommentComposer
          initialText={comment.text}
          initialVisibility={comment.visibility}
          submitLabel="Save"
          busy={busy}
          onSubmit={handleEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div
            ref={textRef}
            className={`${styles.text} ${!expanded ? styles.clamped : ""}`}
          >
            <Markdown
              components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
              }}
            >
              {comment.text}
            </Markdown>
          </div>
          {overflowing && (
            <button className={styles.showMore} onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}

      {!editing && (
        <div className={styles.footer}>
          <div className={styles.reactions}>
            <button
              type="button"
              className={`${styles.reactBtn} ${comment.viewer_reaction === "up" ? styles.reactActive : ""}`}
              onClick={() => react("up")}
              aria-label="Thumbs up"
              aria-pressed={comment.viewer_reaction === "up"}
            >
              <ThumbUpIcon size={16} />
              {comment.likes > 0 && <span className={styles.count}>{comment.likes}</span>}
            </button>
            <button
              type="button"
              className={`${styles.reactBtn} ${comment.viewer_reaction === "down" ? styles.reactActive : ""}`}
              onClick={() => react("down")}
              aria-label="Thumbs down"
              aria-pressed={comment.viewer_reaction === "down"}
            >
              <ThumbDownIcon size={16} />
              {comment.dislikes > 0 && <span className={styles.count}>{comment.dislikes}</span>}
            </button>
          </div>

          {comment.is_mine && (
            <div className={styles.ownActions}>
              {confirming ? (
                <>
                  <span className={styles.confirmText}>Remove?</span>
                  <button className={styles.dangerBtn} onClick={handleDelete} disabled={busy}>
                    {busy ? "Removing…" : "Yes"}
                  </button>
                  <button className={styles.ghostBtn} onClick={() => setConfirming(false)} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <div className={styles.menuWrap} ref={menuWrapRef}>
                  <button
                    type="button"
                    className={`${styles.menuTrigger} ${menuOpen ? styles.menuTriggerOpen : ""}`}
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label="Comment actions"
                  >
                    <MoreIcon size={18} />
                  </button>
                  {menuOpen && (
                    <div className={styles.menu} role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className={styles.menuItem}
                        onClick={() => { setMenuOpen(false); setEditing(true); }}
                      >
                        <PencilIcon size={15} className={styles.menuIcon} />
                        Edit
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                        onClick={() => { setMenuOpen(false); setConfirming(true); }}
                      >
                        <TrashIcon size={15} className={styles.menuIcon} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
