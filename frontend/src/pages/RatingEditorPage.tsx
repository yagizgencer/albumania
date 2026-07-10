import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import {
  ChevronDownIcon,
  CloseIcon,
  DiscIcon,
  ExternalLinkIcon,
  HourglassIcon,
  NoteIcon,
  PaperPlaneIcon,
  PlusIcon,
  SaveIcon,
  SpotifyIcon,
  TrashIcon,
} from "../components/Icons";
import { ImageLightbox } from "../components/ImageLightbox";
import { formatDuration } from "../utils/duration";
import { formatDate } from "../lib/date";
import styles from "./RatingEditorPage.module.css";

const TOP_5_SIZE = 5;

// Center the drag overlay on the cursor regardless of where in the row the grab
// started (otherwise the overlay hangs off wherever you happened to grab). This
// is the standard `snapCenterToCursor` from @dnd-kit/modifiers, inlined so we
// don't pull in that extra package just for one helper.
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (draggingNodeRect && activatorEvent) {
    const coords = getEventCoordinates(activatorEvent);
    if (!coords) return transform;
    const offsetX = coords.x - draggingNodeRect.left;
    const offsetY = coords.y - draggingNodeRect.top;
    return {
      ...transform,
      x: transform.x + offsetX - draggingNodeRect.width / 2,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }
  return transform;
};

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
// Podium slot — a droppable rank position (empty or filled). A filled slot's
// name is itself draggable so slots can be swapped to reorder.
// ---------------------------------------------------------------------------

function SlotName({ track }: { track: AlbumTrack }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `top-${track.index}`,
  });
  return (
    <span
      ref={setNodeRef}
      className={styles.slotName}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      {track.name}
    </span>
  );
}

function TopSlot({
  slotIndex,
  track,
  onRemove,
}: {
  slotIndex: number;
  track: AlbumTrack | null;
  onRemove: (idx: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });
  return (
    <div
      ref={setNodeRef}
      className={`${styles.slot} ${track ? styles.slotFilled : ""} ${
        isOver ? styles.slotOver : ""
      }`}
    >
      <span className={styles.medal} data-r={slotIndex + 1}>
        {slotIndex + 1}
      </span>
      {track ? (
        <>
          <SlotName track={track} />
          <button
            type="button"
            className={styles.xBtn}
            onClick={() => onRemove(track.index)}
            aria-label={`Remove ${track.name} from Top 5`}
            data-tip="Remove"
          >
            <CloseIcon size={14} />
          </button>
        </>
      ) : (
        <span className={styles.slotPh}>Drop a track here</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track pool row. Tracks already in the Top 5 render as a faded, non-draggable
// placeholder (keeps the list from reflowing) but their note stays editable.
// ---------------------------------------------------------------------------

function TrackRow({
  track,
  note,
  noteOpen,
  rank,
  topFull,
  onAdd,
  onToggleNote,
  onNoteChange,
}: {
  track: AlbumTrack;
  note: string;
  noteOpen: boolean;
  rank: number | null; // 1-based Top 5 rank, or null when in the pool
  topFull: boolean;
  onAdd: () => void;
  onToggleNote: () => void;
  onNoteChange: (idx: number, text: string) => void;
}) {
  const inTop5 = rank !== null;
  const hasNote = note.trim() !== "";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `rest-${track.index}`,
    disabled: inTop5,
  });

  return (
    <li>
      {/* The row toggles this track's note; drag it (or use the + button) to rank. */}
      <div
        ref={setNodeRef}
        className={`${styles.trk} ${inTop5 ? styles.trkPicked : ""} ${
          noteOpen ? styles.trkNoteOpen : ""
        }`}
        style={{ opacity: isDragging ? 0.4 : undefined }}
        onClick={onToggleNote}
        aria-expanded={noteOpen}
        {...(inTop5 ? {} : attributes)}
        {...(inTop5 ? {} : listeners)}
      >
        <span className={styles.num}>{track.index}</span>
        <span className={styles.tnm}>{track.name}</span>
        {hasNote && (
          <span className={styles.noteFlag} aria-label="Has a note" data-tip="Has a note">
            <NoteIcon size={17} />
          </span>
        )}
        <span className={styles.dur}>{formatDuration(track.duration_ms)}</span>
        {inTop5 ? (
          <span className={styles.rankPill}>#{rank}</span>
        ) : (
          <button
            type="button"
            className={styles.addBtn}
            // Don't let the button start a drag or toggle the note.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            disabled={topFull}
            aria-label="Add to Top 5"
            data-tip={topFull ? "Top 5 is full" : "Add to Top 5"}
          >
            <PlusIcon size={16} />
          </button>
        )}
      </div>
      {noteOpen && (
        <textarea
          className={styles.noteBox}
          rows={1}
          placeholder="A note about this track… (optional)"
          value={note}
          onChange={(e) => onNoteChange(track.index, e.target.value)}
          // Clicks inside the editor shouldn't bubble to the row (which would
          // collapse it again).
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </li>
  );
}

function TrackOverlayCard({ name }: { name: string }) {
  // The outer wrapper fills the (row-sized) overlay box that dnd-kit creates and
  // centers a compact chip in it, so with `snapCenterToCursor` the small chip
  // lands on the pointer — not a full-width card hanging off to one side.
  return (
    <div className={styles.overlayWrap}>
      <span className={styles.overlayCard}>{name}</span>
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
  // returns here. Falls back to the album page when the origin is unknown.
  const from = (location.state as { from?: string } | null)?.from;
  const origin = from ?? `/albums/${spotifyId}`;

  const [album, setAlbum] = useState<Album | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [score, setScore] = useState<number>(5);
  const [hasScore, setHasScore] = useState(false);
  // Always 5 entries; null = empty slot
  const [topSlots, setTopSlots] = useState<(number | null)[]>(makeEmptySlots());
  const [notes, setNotes] = useState<Record<number, string>>({});
  // Which tracks currently show their note textarea (opened by the pencil, or
  // auto-opened for tracks that loaded with a saved note).
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());
  const [tracksOpen, setTracksOpen] = useState(true);
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
  // A pending programmatic navigation (publish / remove) performed once the
  // dirty flag has cleared, so our own redirect isn't blocked by the guard.
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  const sensors = useSensors(
    // A small activation distance lets a plain click on a pool row "add to next
    // slot" without accidentally starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!spotifyId) return;
    setLoading(true);
    getAlbum(spotifyId)
      .then(async (a) => {
        setAlbum(a);
        // "Rate" drops the user straight into the editor: reuse their draft or
        // create one now rather than showing a separate "Start Rating" gate.
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
    // Tracks that loaded with a note start expanded so the note is visible.
    setOpenNotes(new Set(Object.keys(noteMap).map(Number)));
    // This is now the saved baseline — clears the dirty flag.
    savedSnapshotRef.current = serialize(hs, sc, slots, noteMap);
  }

  // Derived
  const filledCount = topSlots.filter((s) => s !== null).length;
  const canPublish = hasScore && filledCount === TOP_5_SIZE;
  const nextOpenSlot = topSlots.indexOf(null);

  const isDirty =
    !pendingNav &&
    (serialize(hasScore, score, topSlots, notes) !== savedSnapshotRef.current ||
      commentText.trim() !== "");

  const editorId = useId();
  useRegisterUnsaved(editorId, isDirty, () => handleSave());
  const unsavedGuard = useUnsavedNavigationGuard();

  useEffect(() => {
    if (pendingNav && !isDirty) navigate(pendingNav);
  }, [pendingNav, isDirty, navigate]);

  async function handleSave() {
    if (!rating) return;
    setSaving(true); setError(null);
    const notesPatch: Record<number, string> = {};
    for (const [k, v] of Object.entries(notes)) notesPatch[Number(k)] = v;
    // Send the full sparse array so empty slots keep their position. Publish
    // strips this to require all 5 filled.
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
          applyRating(updated);
          setError("Rating published, but the comment could not be posted.");
          return;
        }
      }
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

  function toggleNote(trackIndex: number) {
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(trackIndex)) next.delete(trackIndex);
      else next.add(trackIndex);
      return next;
    });
  }

  function resetTop5() {
    setTopSlots(makeEmptySlots());
  }

  function toggleAllNotes() {
    if (!album) return;
    setOpenNotes((prev) =>
      prev.size >= album.tracks.length
        ? new Set()
        : new Set(album.tracks.map((t) => t.index))
    );
  }

  function handleSetSlot(slotIndex: number, trackIndex: number) {
    if (slotIndex < 0) return;
    setTopSlots((prev) => {
      const next = [...prev];
      // If the track already sits in another slot, clear that one (it moves).
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
    if (!overId.startsWith("slot-")) return;
    const targetSlot = parseInt(overId.split("-")[1], 10);
    const trackIndex = parseInt(activeStr.split("-")[1], 10);

    setTopSlots((prev) => {
      const next = [...prev];
      if (activeStr.startsWith("top-")) {
        // Reorder within Top 5: swap source and target slots.
        const sourceSlot = prev.indexOf(trackIndex);
        if (sourceSlot === targetSlot) return prev;
        next[sourceSlot] = prev[targetSlot];
        next[targetSlot] = trackIndex;
      } else {
        // From the pool into a slot (may displace the existing track).
        next[targetSlot] = trackIndex;
      }
      return next;
    });
  }

  if (loading) return <main className={styles.page}><LoadingState /></main>;
  if (error && !album) return <main className={styles.page}><Alert>{error}</Alert></main>;
  if (!album) return null;

  const trackMap = new Map(album.tracks.map((t) => [t.index, t]));
  const slotByTrackIndex = new Map<number, number>();
  topSlots.forEach((trackIndex, slotIndex) => {
    if (trackIndex !== null) slotByTrackIndex.set(trackIndex, slotIndex);
  });
  const isPublished = rating?.status === "published";
  const totalMs = album.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);
  const hasAnyDuration = album.tracks.some((t) => t.duration_ms != null);
  const spotifyAlbumUrl = `https://open.spotify.com/album/${album.spotify_id}`;
  // Tracks laid out in two columns (first half | second half), preserving order.
  const mid = Math.ceil(album.tracks.length / 2);
  const trackColumns = [album.tracks.slice(0, mid), album.tracks.slice(mid)].filter(
    (col) => col.length > 0
  );
  const topFull = nextOpenSlot === -1;
  const allNotesOpen = album.tracks.length > 0 && openNotes.size >= album.tracks.length;

  const activeTrackIndex = activeId ? parseInt(activeId.split("-")[1], 10) : null;
  const activeTrack = activeTrackIndex !== null ? trackMap.get(activeTrackIndex) : null;

  // Publish gating message (shown as the button's tooltip when disabled).
  const publishTip = !hasScore
    ? "Set a score before publishing"
    : filledCount !== TOP_5_SIZE
    ? "Fill all 5 Top 5 slots before publishing"
    : "Publish rating";

  return (
    <main className={styles.page}>
      <div className={styles.grid}>
        {/* -------- Left: the album + score + actions card -------- */}
        <aside className={`${styles.card} ${styles.leftCard}`}>
          {album.album_art_url ? (
            <ImageLightbox
              src={album.album_art_url}
              alt={`${album.title} cover`}
              thumbClassName={styles.cover}
            />
          ) : (
            <div className={`${styles.cover} ${styles.coverEmpty}`} aria-hidden>♪</div>
          )}

          <div className={styles.titleBlock}>
            <h1 className={styles.title}>
              <Link className={styles.headerLink} to={`/albums/${album.spotify_id}`}>
                {album.title}
              </Link>
              <a
                className={styles.spotifyLink}
                href={spotifyAlbumUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open on Spotify"
                data-tip="Open on Spotify"
              >
                <ExternalLinkIcon size={14} className={styles.spotifyArrow} />
                <SpotifyIcon size={19} className={styles.spotifyMark} />
              </a>
            </h1>
            <p className={styles.sub}>
              {album.artist_spotify_id ? (
                <Link className={styles.headerLink} to={`/artists/${album.artist_spotify_id}`}>
                  {album.artist}
                </Link>
              ) : (
                album.artist
              )}
            </p>
            <div className={styles.metaChips}>
              <span className={styles.metaChip}>
                <DiscIcon size={14} className={styles.metaChipIcon} />
                <span className={styles.metaChipText}>{formatDate(album.release_date)}</span>
              </span>
              {hasAnyDuration && (
                <span className={styles.metaChip}>
                  <HourglassIcon size={14} className={styles.metaChipIcon} />
                  <span className={styles.metaChipText}>{formatDuration(totalMs)}</span>
                </span>
              )}
            </div>
          </div>

          <hr className={styles.hr} />

          {/* Score — amber pill + slider */}
          <div className={styles.scoreBlock}>
            <span className={styles.scoreLabel}>Your score</span>
            <div className={styles.scoreRow}>
              <span className={styles.scorePill}>
                {hasScore ? score.toFixed(1) : "—"}
                <span className={styles.scorePillOut}>/10</span>
              </span>
              <input
                className={styles.scoreRange}
                type="range"
                min={0}
                max={10}
                step={0.1}
                value={hasScore ? score : 5}
                aria-label="Your score"
                onChange={(e) => { setHasScore(true); setScore(Number(e.target.value)); }}
              />
            </div>
          </div>

          <hr className={styles.hr} />

          {/* Icon actions */}
          <div className={styles.iconBar}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconSave}`}
              onClick={handleSave}
              disabled={saving}
              aria-label="Save draft"
              data-tip={saving ? "Saving…" : "Save draft"}
            >
              <SaveIcon size={24} />
            </button>
            {!isPublished && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.iconPublish}`}
                onClick={handlePublish}
                disabled={saving || !canPublish}
                aria-label="Publish rating"
                data-tip={publishTip}
              >
                <PaperPlaneIcon size={24} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconRemove}`}
              onClick={() => setConfirmingRemove(true)}
              disabled={saving}
              aria-label="Remove rating"
              data-tip="Remove rating"
            >
              <TrashIcon size={24} />
            </button>
          </div>

          {confirmingRemove && (
            <div className={styles.confirm}>
              <span className={styles.confirmText}>Remove this rating?</span>
              <div className={styles.confirmBtns}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={handleRemove}
                  disabled={saving}
                >
                  {saving ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnCancel}`}
                  onClick={() => setConfirmingRemove(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && <Alert>{error}</Alert>}
        </aside>

        {/* -------- Right: Top 5 + tracks + comment -------- */}
        <section className={styles.card}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className={styles.sectionHead}>
              <h2>Your Top 5</h2>
              {filledCount > 0 && (
                <button
                  type="button"
                  className={`${styles.linkBtn} ${styles.mlAuto}`}
                  onClick={resetTop5}
                >
                  Reset
                </button>
              )}
            </div>

            <div className={styles.podium}>
              {topSlots.map((trackIndex, slotIndex) => (
                <TopSlot
                  key={slotIndex}
                  slotIndex={slotIndex}
                  track={trackIndex !== null ? (trackMap.get(trackIndex) ?? null) : null}
                  onRemove={handleRemoveFromTop5}
                />
              ))}
            </div>

            <hr className={styles.hr} />

            {/* Tracks — collapsible, expanded by default; the drag source. */}
            <div className={styles.tracksBlock}>
              <div className={styles.tracksHead}>
                <button
                  type="button"
                  className={styles.tracksToggle}
                  onClick={() => setTracksOpen((o) => !o)}
                  aria-expanded={tracksOpen}
                  aria-label={`Tracks (${album.tracks.length})`}
                >
                  <span className={styles.tracksLabel}>
                    Tracks <span className={styles.tracksCount}>({album.tracks.length})</span>
                  </span>
                  <ChevronDownIcon
                    size={20}
                    className={`${styles.chevron} ${tracksOpen ? styles.chevronOpen : ""}`}
                  />
                </button>
                {tracksOpen && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={toggleAllNotes}
                  >
                    {allNotesOpen ? "Hide all notes" : "Show all notes"}
                  </button>
                )}
              </div>
              {tracksOpen && (
                <div className={styles.trackCols}>
                  {trackColumns.map((col, ci) => (
                    <ul key={ci} className={styles.trackList}>
                      {col.map((track) => {
                        const slotIndex = slotByTrackIndex.get(track.index);
                        return (
                          <TrackRow
                            key={track.index}
                            track={track}
                            note={notes[track.index] ?? ""}
                            noteOpen={openNotes.has(track.index)}
                            rank={slotIndex !== undefined ? slotIndex + 1 : null}
                            topFull={topFull}
                            onAdd={() => handleSetSlot(nextOpenSlot, track.index)}
                            onToggleNote={() => toggleNote(track.index)}
                            onNoteChange={handleNoteChange}
                          />
                        );
                      })}
                    </ul>
                  ))}
                </div>
              )}
            </div>

            <DragOverlay modifiers={[snapCenterToCursor]}>
              {activeTrack ? <TrackOverlayCard name={activeTrack.name} /> : null}
            </DragOverlay>
          </DndContext>

          {!isPublished && (
            <>
              <hr className={styles.hr} />
              <div className={styles.sectionHead}>
                <h2>A few words</h2>
              </div>
              <CommentComposer
                value={commentText}
                onChange={setCommentText}
                visibility={commentVisibility}
                onVisibilityChange={setCommentVisibility}
                placeholder="Share your thoughts on this album… (optional, posted when you publish)"
              />
            </>
          )}
        </section>
      </div>

      <UnsavedChangesModal {...unsavedGuard} />
    </main>
  );
}
