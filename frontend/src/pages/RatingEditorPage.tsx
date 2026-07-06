import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album, type AlbumTrack } from "../api/albums";
import {
  createRating,
  deleteRating,
  getMyRatingForAlbum,
  patchRating,
  publishRating,
  type Rating,
} from "../api/ratings";
import { createComment, type Visibility } from "../api/comments";
import {
  useRegisterUnsaved,
  useUnsavedNavigationGuard,
} from "../lib/unsavedChanges";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { Alert } from "../components/Alert";
import { CommentComposer } from "../components/CommentComposer";
import { LoadingState } from "../components/Spinner";
import styles from "./RatingEditorPage.module.css";

const TOP_5_SIZE = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptySlots(): (number | null)[] {
  return Array(TOP_5_SIZE).fill(null);
}

function slotsFromIndices(indices: (number | null)[]): (number | null)[] {
  const slots = makeEmptySlots();
  indices.slice(0, TOP_5_SIZE).forEach((idx, i) => { slots[i] = idx; });
  return slots;
}

// ---------------------------------------------------------------------------
// DraggableTrack — used for both top-5 filled slots and rest tracks
// ---------------------------------------------------------------------------

function DraggableTrack({
  id,
  track,
  note,
  onNoteChange,
  actions,
  positionLabel,
}: {
  id: string;
  track: AlbumTrack;
  note: string;
  onNoteChange: (idx: number, text: string) => void;
  actions?: React.ReactNode;
  positionLabel?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className={styles.trackItem}
      style={{ opacity: isDragging ? 0.3 : 1 }}
    >
      <div className={styles.trackRow}>
        <span className={styles.dragHandle} {...attributes} {...listeners}>⠿</span>
        {positionLabel}
        <span className={styles.trackName}>{track.name}</span>
        {actions}
      </div>
      <textarea
        className={styles.noteInput}
        rows={1}
        placeholder="Add a note… (optional)"
        value={note}
        onChange={(e) => onNoteChange(track.index, e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopSlot — always rendered (empty or filled)
// ---------------------------------------------------------------------------

function TopSlot({
  slotIndex,
  track,
  note,
  onNoteChange,
  onRemove,
}: {
  slotIndex: number;
  track: AlbumTrack | null;
  note: string;
  onNoteChange: (idx: number, text: string) => void;
  onRemove: (idx: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.slot} ${isOver ? styles.slotOver : ""}`}
    >
      {track ? (
        <DraggableTrack
          id={`top-${track.index}`}
          track={track}
          note={note}
          onNoteChange={onNoteChange}
          positionLabel={
            <span className={styles.trackPosition}>{slotIndex + 1}</span>
          }
          actions={
            <button
              className={`${styles.trackBtn} ${styles.trackBtnRemove}`}
              onClick={() => onRemove(track.index)}
              type="button"
            >
              Remove
            </button>
          }
        />
      ) : (
        <div className={styles.slotEmpty}>
          <span className={styles.slotNumber}>{slotIndex + 1}</span>
          <span className={styles.slotHint}>Drop a track here</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RestTrack — draggable, with optional "Add" button fallback
// ---------------------------------------------------------------------------

function RestTrack({
  track,
  note,
  topSlots,
  onNoteChange,
  onSetSlot,
}: {
  track: AlbumTrack;
  note: string;
  topSlots: (number | null)[];
  onNoteChange: (idx: number, text: string) => void;
  onSetSlot: (slotIndex: number, trackIndex: number) => void;
}) {
  return (
    <DraggableTrack
      id={`rest-${track.index}`}
      track={track}
      note={note}
      onNoteChange={onNoteChange}
      actions={
        <div className={styles.slotButtonRow} role="group" aria-label="Add to slot">
          {topSlots.map((slotTrack, slotIndex) => (
            <button
              key={slotIndex}
              type="button"
              className={styles.slotButton}
              onClick={() => onSetSlot(slotIndex, track.index)}
              title={
                slotTrack === null
                  ? `Place in slot ${slotIndex + 1}`
                  : `Replace slot ${slotIndex + 1}`
              }
            >
              {slotIndex + 1}
            </button>
          ))}
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// RestPlaceholder — empty slot rendered when a track currently lives in Top 5,
// so the rest list never collapses or reorders.
// ---------------------------------------------------------------------------

function RestPlaceholder({ track, slotIndex }: { track: AlbumTrack; slotIndex: number }) {
  return (
    <div className={`${styles.trackItem} ${styles.restPlaceholder}`}>
      <div className={styles.trackRow}>
        <span className={styles.dragHandle} aria-hidden="true">⠿</span>
        <span className={styles.trackName}>{track.name}</span>
        <span className={styles.restPlaceholderBadge}>In Top 5 · #{slotIndex + 1}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RestZone — droppable container that accepts top-5 tracks to remove them
// ---------------------------------------------------------------------------

function RestZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "rest-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.restZone} ${isOver ? styles.restZoneOver : ""}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay card shown while dragging
// ---------------------------------------------------------------------------

function TrackOverlayCard({ name }: { name: string }) {
  return (
    <div className={styles.overlayCard}>
      <span className={styles.dragHandle}>⠿</span>
      <span>{name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RatingEditorPage() {
  const { spotifyId } = useParams<{ spotifyId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Where the editor was opened from (album page or Listen Later); publishing
  // returns here. Falls back to the album page when the origin is unknown
  // (direct link / refresh).
  const from = (location.state as { from?: string } | null)?.from;
  const origin = from ?? `/albums/${spotifyId}`;

  const [album, setAlbum] = useState<Album | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [score, setScore] = useState<number>(5);
  const [hasScore, setHasScore] = useState(false);
  // Always 5 entries; null = empty slot
  const [topSlots, setTopSlots] = useState<(number | null)[]>(makeEmptySlots());
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<Visibility>("public");
  // Serialized snapshot of the last saved rating state; used to detect unsaved
  // edits. Reset by applyRating (load/save).
  const savedSnapshotRef = useRef<string>("");
  // A pending programmatic navigation (publish / remove). We clear our dirty
  // registration first, then this effect performs the nav once the guard is no
  // longer armed — so our own navigation isn't blocked.
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!spotifyId) return;
    setLoading(true);
    getAlbum(spotifyId)
      .then(async (a) => {
        setAlbum(a);
        // "Rate" should drop the user straight into the editor. If they don't
        // have a rating for this album yet, create the draft now rather than
        // showing a separate "Start Rating" gate.
        try {
          applyRating(await getMyRatingForAlbum(a.id));
        } catch {
          try {
            applyRating(await createRating(a.id));
          } catch (e: unknown) {
            // 409 = a rating already exists (created concurrently) → fetch it.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((e as any)?.response?.status === 409) {
              try {
                applyRating(await getMyRatingForAlbum(a.id));
              } catch {
                setError("Could not open the rating editor.");
              }
            } else {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              setError((e as any)?.response?.data?.detail ?? "Could not start rating.");
            }
          }
        }
      })
      .catch(() => setError("Failed to load album."))
      .finally(() => setLoading(false));
  }, [spotifyId]);

  // A stable string capturing the editable rating state, for dirty-detection.
  function serialize(
    hs: boolean,
    sc: number,
    slots: (number | null)[],
    ns: Record<number, string>
  ): string {
    const noteEntries = Object.entries(ns)
      .filter(([, v]) => v.trim() !== "")
      .sort(([a], [b]) => Number(a) - Number(b));
    return JSON.stringify({ hs, sc: hs ? sc : null, slots, notes: noteEntries });
  }

  function applyRating(r: Rating) {
    setRating(r);
    const hs = r.score !== null;
    const sc = r.score ?? 5;
    if (hs) { setScore(sc); setHasScore(true); }
    const slots = slotsFromIndices(r.top_track_indices ?? []);
    setTopSlots(slots);
    const noteMap: Record<number, string> = {};
    for (const n of r.notes) noteMap[n.track_index] = n.note_text;
    setNotes(noteMap);
    // This is now the saved baseline — clears the dirty flag.
    savedSnapshotRef.current = serialize(hs, sc, slots, noteMap);
  }

  // Derived
  const filledCount = topSlots.filter((s) => s !== null).length;
  const canPublish = hasScore && filledCount === TOP_5_SIZE;

  // Unsaved edits: the rating differs from the last saved state, or there's text
  // in the publish comment box that would be lost. Suppressed once we've kicked
  // off our own programmatic navigation (publish / remove).
  const isDirty =
    !pendingNav &&
    (serialize(hasScore, score, topSlots, notes) !== savedSnapshotRef.current ||
      commentText.trim() !== "");

  // Register with the shared unsaved-changes guard. "Save" for the guard writes
  // the current draft (Save & quit uses this).
  const editorId = useId();
  useRegisterUnsaved(editorId, isDirty, () => handleSave());
  const unsavedGuard = useUnsavedNavigationGuard();

  // Perform a queued programmatic nav once our dirty flag has cleared (so the
  // guard doesn't block our own publish/remove redirect).
  useEffect(() => {
    if (pendingNav && !isDirty) navigate(pendingNav);
  }, [pendingNav, isDirty, navigate]);

  async function handleSave() {
    if (!rating) return;
    setSaving(true); setError(null);
    const notesPatch: Record<number, string> = {};
    for (const [k, v] of Object.entries(notes)) notesPatch[Number(k)] = v;
    // Send the full sparse array so empty slots in the middle keep their
    // position. Publish strips this to require all 5 filled.
    try {
      const updated = await patchRating(rating.id, {
        score: hasScore ? score : undefined,
        top_track_indices: topSlots,
        notes: notesPatch,
      });
      applyRating(updated);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios error shape
      setError((e as any)?.response?.data?.detail ?? "Save failed.");
    } finally { setSaving(false); }
  }

  async function handlePublish() {
    if (!rating || !album) return;
    setSaving(true); setError(null);
    try {
      await handleSave();
      const updated = await publishRating(rating.id);
      // Optional: post the comment written in the publish box. Comments are
      // decoupled from ratings, so a comment failure doesn't undo the publish.
      const trimmed = commentText.trim();
      if (trimmed) {
        try {
          await createComment(album.spotify_id, { text: trimmed, visibility: commentVisibility });
          setCommentText("");
        } catch {
          // Comment failed but the rating is published — surface it and stay so
          // the user can retry the comment (don't redirect over the message).
          applyRating(updated);
          setError("Rating published, but the comment could not be posted.");
          return;
        }
      }
      // Published successfully → leave the editor for wherever we came from.
      // Queue the nav so it fires after our dirty flag clears (see the effect).
      setPendingNav(origin);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any)?.response?.data?.detail ?? "Publish failed.");
    } finally { setSaving(false); }
  }

  async function handleRemove() {
    if (!rating) return;
    setSaving(true); setError(null);
    try {
      await deleteRating(rating.id);
      setPendingNav(origin);
    } catch { setError("Remove failed."); setSaving(false); setConfirmingRemove(false); }
  }

  function handleNoteChange(trackIndex: number, text: string) {
    setNotes((prev) => ({ ...prev, [trackIndex]: text }));
  }

  function handleSetSlot(slotIndex: number, trackIndex: number) {
    setTopSlots((prev) => {
      const next = [...prev];
      // If the track is already in another slot, clear that slot (track moves).
      const existing = prev.indexOf(trackIndex);
      if (existing !== -1) next[existing] = null;
      next[slotIndex] = trackIndex;
      return next;
    });
  }

  function handleRemoveFromTop5(trackIndex: number) {
    setTopSlots((prev) => prev.map((s) => (s === trackIndex ? null : s)));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    const activeStr = String(active.id);

    // Drop a top-5 track onto the rest zone → remove from top 5.
    if (overId === "rest-zone" && activeStr.startsWith("top-")) {
      const trackIndex = parseInt(activeStr.split("-")[1], 10);
      handleRemoveFromTop5(trackIndex);
      return;
    }

    if (!overId.startsWith("slot-")) return;
    const targetSlot = parseInt(overId.split("-")[1], 10);

    setTopSlots((prev) => {
      const next = [...prev];

      if (activeStr.startsWith("top-")) {
        // Reorder within top 5: swap source and target slots
        const trackIndex = parseInt(activeStr.split("-")[1], 10);
        const sourceSlot = prev.indexOf(trackIndex);
        if (sourceSlot === targetSlot) return prev;
        next[sourceSlot] = prev[targetSlot];
        next[targetSlot] = trackIndex;
      } else {
        // From rest into a slot (may displace existing track, which returns to rest)
        const trackIndex = parseInt(activeStr.split("-")[1], 10);
        next[targetSlot] = trackIndex;
      }

      return next;
    });
  }

  if (loading) return <div className={styles.page}><LoadingState /></div>;
  if (error && !album) return <div className={styles.page}><Alert>{error}</Alert></div>;
  if (!album) return null;

  const trackMap = new Map(album.tracks.map((t) => [t.index, t]));
  const slotByTrackIndex = new Map<number, number>();
  topSlots.forEach((trackIndex, slotIndex) => {
    if (trackIndex !== null) slotByTrackIndex.set(trackIndex, slotIndex);
  });
  const isPublished = rating?.status === "published";

  // Track name for overlay
  const activeTrackIndex = activeId
    ? parseInt(activeId.split("-")[1], 10)
    : null;
  const activeTrack = activeTrackIndex !== null ? trackMap.get(activeTrackIndex) : null;

  return (
    <div className={styles.page}>
      {/* Album header */}
      <div className={styles.albumHeader}>
        {album.album_art_url && (
          <img className={styles.albumArt} src={album.album_art_url} alt={album.title} width={80} height={80} />
        )}
        <div className={styles.albumMeta}>
          <h1>{album.title}</h1>
          <p>{album.artist} · {album.release_date.slice(0, 4)} · {album.total_songs} tracks</p>
          {rating && (
            <span className={`${styles.badge} ${isPublished ? styles.badgePublished : styles.badgeDraft}`}>
              {isPublished ? "Published" : "Draft"}
            </span>
          )}
        </div>
      </div>

      {rating && (
        <>
          {/* Score */}
          <div className={styles.section}>
            <h2>Score</h2>
            <div className={styles.scoreRow}>
              <input
                className={styles.scoreInput}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={hasScore ? score : 5}
                onChange={(e) => { setHasScore(true); setScore(Number(e.target.value)); }}
              />
              <span className={styles.scoreValue}>{hasScore ? score.toFixed(1) : "—"}</span>
            </div>
          </div>

          {/* Top 5 + Rest share one DndContext */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={styles.dndGrid}>
              {/* Rest (left, scrollable) */}
              <section className={styles.restColumn}>
                <h2 className={styles.columnHeading}>All Tracks</h2>
                <RestZone>
                  <ul className={styles.trackList}>
                    {album.tracks.map((track) => {
                      const slotIndex = slotByTrackIndex.get(track.index);
                      return (
                        <li key={track.index}>
                          {slotIndex !== undefined ? (
                            <RestPlaceholder track={track} slotIndex={slotIndex} />
                          ) : (
                            <RestTrack
                              track={track}
                              note={notes[track.index] ?? ""}
                              topSlots={topSlots}
                              onNoteChange={handleNoteChange}
                              onSetSlot={handleSetSlot}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </RestZone>
              </section>

              {/* Top 5 (right, sticky) */}
              <aside className={styles.topColumn}>
                <h2 className={styles.columnHeading}>Top 5 ({filledCount}/{TOP_5_SIZE})</h2>
                <div className={styles.slotList}>
                  {topSlots.map((trackIndex, slotIndex) => (
                    <TopSlot
                      key={slotIndex}
                      slotIndex={slotIndex}
                      track={trackIndex !== null ? (trackMap.get(trackIndex) ?? null) : null}
                      note={trackIndex !== null ? (notes[trackIndex] ?? "") : ""}
                      onNoteChange={handleNoteChange}
                      onRemove={handleRemoveFromTop5}
                    />
                  ))}
                </div>
              </aside>
            </div>

            <DragOverlay>
              {activeTrack ? <TrackOverlayCard name={activeTrack.name} /> : null}
            </DragOverlay>
          </DndContext>

          {!isPublished && (
            <div className={styles.section}>
              <h2>Comment (optional)</h2>
              <CommentComposer
                value={commentText}
                onChange={setCommentText}
                visibility={commentVisibility}
                onVisibilityChange={setCommentVisibility}
                placeholder="Add a comment to publish with your rating…"
              />
            </div>
          )}

          {/* Actions */}
          {error && <Alert>{error}</Alert>}
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Draft"}
            </button>
            {!isPublished && (
              <button
                className={`${styles.btn} ${styles.btnSuccess}`}
                onClick={handlePublish}
                disabled={saving || !canPublish}
                title={
                  !hasScore
                    ? "Set a score before publishing"
                    : filledCount !== TOP_5_SIZE
                    ? "Fill all 5 top track slots before publishing"
                    : undefined
                }
              >
                Publish
              </button>
            )}
            {confirmingRemove ? (
              <div className={styles.confirm}>
                <span className={styles.confirmText}>Remove this rating?</span>
                <button
                  className={`${styles.btn} ${styles.btnRemoveConfirm}`}
                  onClick={handleRemove}
                  disabled={saving}
                >
                  {saving ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnCancel}`}
                  onClick={() => setConfirmingRemove(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className={`${styles.btn} ${styles.btnRemove}`}
                onClick={() => setConfirmingRemove(true)}
                disabled={saving}
              >
                Remove
              </button>
            )}
          </div>
        </>
      )}

      <UnsavedChangesModal {...unsavedGuard} />
    </div>
  );
}
