import { useEffect, useState } from "react";
import {
  createComment,
  listComments,
  type Comment,
  type CommentSort,
  type SortOrder,
  type Visibility,
} from "../api/comments";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { Alert } from "./Alert";
import { Select } from "./Select";
import { LoadingState } from "./Spinner";
import styles from "./CommentsSection.module.css";

const SORT_OPTIONS: { value: CommentSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "score", label: "Most liked" },
];
const ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "desc", label: "Descending" },
  { value: "asc", label: "Ascending" },
];

const INITIAL_VISIBLE = 10;

export function CommentsSection({ spotifyId }: { spotifyId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [sort, setSort] = useState<CommentSort>("recent");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setComments(null);
    setError(null);
    listComments(spotifyId, sort, order)
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load comments.");
      });
    return () => {
      cancelled = true;
    };
  }, [spotifyId, sort, order]);

  async function handleAdd(text: string, visibility: Visibility) {
    setPosting(true);
    try {
      await createComment(spotifyId, { text, visibility });
      const data = await listComments(spotifyId, sort, order);
      setComments(data);
    } finally {
      setPosting(false);
    }
  }

  const count = comments?.length ?? 0;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Comments ({count})</h2>
        <div className={styles.sortControls}>
          <Select
            value={sort}
            options={SORT_OPTIONS}
            onChange={setSort}
            ariaLabel="Sort comments by"
          />
          <Select
            value={order}
            options={ORDER_OPTIONS}
            onChange={setOrder}
            ariaLabel="Sort order"
          />
        </div>
      </div>

      <div className={styles.addBox}>
        <CommentComposer busy={posting} onSubmit={handleAdd} />
      </div>

      {error && <Alert>{error}</Alert>}
      {comments === null ? (
        <LoadingState />
      ) : comments.length === 0 ? (
        <p className={styles.empty}>No comments yet. Be the first!</p>
      ) : (
        <>
          <div className={showAll ? styles.scrollList : styles.list}>
            {(showAll ? comments : comments.slice(0, INITIAL_VISIBLE)).map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                onUpdated={(updated) =>
                  setComments((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
                }
                onDeleted={(id) => setComments((prev) => prev?.filter((x) => x.id !== id) ?? null)}
              />
            ))}
          </div>
          {comments.length > INITIAL_VISIBLE && (
            <button className={styles.showMore} onClick={() => setShowAll((v) => !v)}>
              {showAll
                ? "Show fewer comments"
                : `Show ${comments.length - INITIAL_VISIBLE} more comment${
                    comments.length - INITIAL_VISIBLE === 1 ? "" : "s"
                  }`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
