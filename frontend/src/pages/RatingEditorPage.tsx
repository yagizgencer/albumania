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
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAlbum, type Album, type AlbumTrack } from "../api/albums";
import {
  createRating,
  deleteRating,
  getMyRatingForAlbum,
  patchRating,
  publishRating,
  type Rating,
} from "../api/ratings";
import styles from "./RatingEditorPage.module.css";

const TOP_5_SIZE = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptySlots(): (number | null)[] {
  return Array(TOP_5_SIZE).fill(null);
}

function slotsFromIndices(indices: number[]): (number | null)[] {
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
  canAdd,
  onNoteChange,
  onAdd,
}: {
  track: AlbumTrack;
  note: string;
  canAdd: boolean;
  onNoteChange: (idx: number, text: string) => void;
  onAdd: (idx: number) => void;
}) {
  return (
    <DraggableTrack
      id={`rest-${track.index}`}
      track={track}
      note={note}
      onNoteChange={onNoteChange}
      actions={
        canAdd ? (
          <button
            className={styles.trackBtn}
            onClick={() => onAdd(track.index)}
            type="button"
          >
            + Top 5
          </button>
        ) : undefined
      }
    />
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
  const [error, setError] = useState<string | null>(null);

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
        try {
          const r = await getMyRatingForAlbum(a.id);
          applyRating(r);
        } catch {
          // 404 = no rating yet
        }
      })
      .catch(() => setError("Failed to load album."))
      .finally(() => setLoading(false));
  }, [spotifyId]);

  function applyRating(r: Rating) {
    setRating(r);
    if (r.score !== null) { setScore(r.score); setHasScore(true); }
    setTopSlots(slotsFromIndices(r.top_track_indices ?? []));
    const noteMap: Record<number, string> = {};
    for (const n of r.notes) noteMap[n.track_index] = n.note_text;
    setNotes(noteMap);
  }

  // Derived
  const filledCount = topSlots.filter((s) => s !== null).length;
  const canPublish = hasScore && filledCount === TOP_5_SIZE;

  async function handleStartRating() {
    if (!album) return;
    setSaving(true); setError(null);
    try {
      const r = await createRating(album.id);
      applyRating(r);
    } catch { setError("Failed to create rating."); }
    finally { setSaving(false); }
  }

  async function handleSave() {
    if (!rating) return;
    setSaving(true); setError(null);
    const notesPatch: Record<number, string> = {};
    for (const [k, v] of Object.entries(notes)) notesPatch[Number(k)] = v;
    const top_track_indices = topSlots.filter((n): n is number => n !== null);
    try {
      const updated = await patchRating(rating.id, {
        score: hasScore ? score : undefined,
        top_track_indices,
        notes: notesPatch,
      });
      applyRating(updated);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios error shape
      setError((e as any)?.response?.data?.detail ?? "Save failed.");
    } finally { setSaving(false); }
  }

  async function handlePublish() {
    if (!rating) return;
    setSaving(true); setError(null);
    try {
      await handleSave();
      const updated = await publishRating(rating.id);
      applyRating(updated);
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any)?.response?.data?.detail ?? "Publish failed.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!rating) return;
    if (!confirm("Delete this rating? This cannot be undone.")) return;
    setSaving(true); setError(null);
    try {
      await deleteRating(rating.id);
      navigate("/");
    } catch { setError("Delete failed."); setSaving(false); }
  }

  function handleNoteChange(trackIndex: number, text: string) {
    setNotes((prev) => ({ ...prev, [trackIndex]: text }));
  }

  function handleAddToTop5(trackIndex: number) {
    setTopSlots((prev) => {
      const emptyIdx = prev.indexOf(null);
      if (emptyIdx === -1) return prev;
      const next = [...prev];
      next[emptyIdx] = trackIndex;
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
    if (!overId.startsWith("slot-")) return;

    const targetSlot = parseInt(overId.split("-")[1], 10);
    const activeStr = String(active.id);

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

  if (loading) return <div className={styles.page}>Loading…</div>;
  if (error && !album) return <div className={styles.page}>{error}</div>;
  if (!album) return null;

  const trackMap = new Map(album.tracks.map((t) => [t.index, t]));
  const topTrackIndices = new Set(topSlots.filter((s): s is number => s !== null));
  const restTracks = album.tracks.filter((t) => !topTrackIndices.has(t.index));
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

      {!rating && (
        <div className={styles.startBox}>
          <p>You haven't rated this album yet.</p>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleStartRating} disabled={saving}>
            Start Rating
          </button>
        </div>
      )}

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
            {/* Top 5 */}
            <div className={styles.section}>
              <h2>Top 5 ({filledCount}/{TOP_5_SIZE})</h2>
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
            </div>

            {/* Rest */}
            <div className={styles.section}>
              <h2>Remaining Tracks</h2>
              {restTracks.length === 0 ? (
                <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>All tracks are in your Top 5.</p>
              ) : (
                <ul className={styles.trackList}>
                  {restTracks.map((track) => (
                    <li key={track.index}>
                      <RestTrack
                        track={track}
                        note={notes[track.index] ?? ""}
                        canAdd={filledCount < TOP_5_SIZE}
                        onNoteChange={handleNoteChange}
                        onAdd={handleAddToTop5}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DragOverlay>
              {activeTrack ? <TrackOverlayCard name={activeTrack.name} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Actions */}
          {error && <p className={styles.error}>{error}</p>}
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
            <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
