# Phase 63 — Make track dragging work on touch

Long-press dragging in the rating editor was unreliable on Android: holding often started a **text selection**, and dragging usually **scrolled the page**. Phase 61 added a `TouchSensor` intending to fix exactly this. It did not work, and tracing the installed dnd-kit source shows why.

## The lesson: a registered sensor is not an active one

`RatingEditorPage.tsx` registered **both** `PointerSensor` (`{ distance: 6 }`) and `TouchSensor` (`{ delay: 200, tolerance: 5 }`). In `@dnd-kit/core@6.3.1`:

- `PointerSensor` binds `onPointerDown`, `TouchSensor` binds `onTouchStart`, `MouseSensor` binds `onMouseDown`.
- All activators are flattened into a single listener bundle, each wrapped in a guard that bails when `activeRef.current !== null` — **the first sensor to fire wins, the rest are ignored**.
- Chrome dispatches `pointerdown` *before* `touchstart` for touch input.

So the PointerSensor claimed every touch and the long-press delay never ran. What remained was a 6px-of-movement trigger — precisely the movement that starts a scroll. dnd-kit only calls `preventDefault()` *after* activation, so the browser won the race, emitted `pointercancel`, and tore the drag down.

`PointerSensor` is dnd-kit's *alternative* to `MouseSensor` + `TouchSensor`, not a companion to them, and `activationConstraint` cannot filter by `pointerType`. **Fixed by swapping `PointerSensor` → `MouseSensor`**, so mouse and touch route to disjoint sensors.

The phase-61 test asserted only that a `TouchSensor` had been *registered*, which is why it passed happily while dragging was completely broken on phones. It now asserts the whole registered set, including that **no `PointerSensor`** is present — verified to fail when one is put back.

## The other two causes

**`touch-action: manipulation` does not stop panning.** It is `auto` minus double-tap-zoom, i.e. still `pan-x pan-y`. The comment claimed it preserved scrolling without blocking drags; in practice scrolling always won. dnd-kit's own `DragOverlay` uses `touch-action: none`, which is what a drag surface needs — but putting `none` on the row would make the track list, the tallest thing on the page, unscrollable.

**Nothing disabled text selection.** `user-select` was absent on both drag surfaces and there is no global rule, so a ~500ms press on selectable text raised Android's selection UI, firing `touchcancel`. dnd-kit's own defence is reactive — it clears selection inside `handleStart`, which never runs while the user holds still, so a stationary long-press was exactly the uncovered case. `SlotName` was the worst of it: its listeners were spread on a bare `<span>` of text.

## Changes

| File | Change |
|---|---|
| `RatingEditorPage.tsx` | `PointerSensor` → `MouseSensor`; touch tolerance 5 → 12 (a thumb is not steady); drag handles on `TrackRow` and `SlotName`; explicit `autoScroll` on `DndContext` |
| `RatingEditorPage.module.css` | New `.grip`; `user-select: none` + `-webkit-touch-callout: none` on `.trk`, `.slotName`, `.grip`; `.slotName` becomes a flex row with truncation moved to `.slotNameText` |
| `components/Icons.tsx` | New `GripIcon` — no grip/dots/bars glyph existed among the 36 icons; follows `MoreIcon`'s dot idiom |
| `RatingEditorPage.test.tsx` | Asserts the disjoint sensor set rather than mere registration |

### The handle, without a JS media query

`listeners` from `useDraggable` is a map of the registered sensors' activators — `{ onMouseDown, onTouchStart, onKeyDown }`. Splitting it puts each input on the right surface with no hook and no `matchMedia`:

```tsx
const { onTouchStart, ...pointerListeners } = listeners ?? {};
```

- **row** gets `pointerListeners` → desktop keeps whole-row dragging, and touch can no longer start a drag from the row
- **grip** gets `onTouchStart` → the only touch drag surface, and it carries `touch-action: none`, so the browser never competes for that gesture

The grip is `display: none` under `@media (pointer: fine)`, so desktop is visually unchanged.

### The `+` button had to be fixed in the same change

`.addBtn` stopped propagation on `onPointerDown` only — touch-blind. That was harmless while the TouchSensor was dead, but making the sensor live would have meant a press-and-hold on `+` starting a drag. It now stops `onMouseDown` and `onTouchStart` too. **A latent bug that only becomes reachable once you fix something else still belongs in that same commit.**

### Auto-scroll

Requested so a Top-5 slot that is off screen can still be reached. `.trackList` sets no `overflow`, so the window is the only scroll container and dnd-kit's default auto-scroll applies to it — it was never the problem, it simply never got to run because drags never activated. Now configured explicitly with a 25% vertical threshold so the trigger zone clears the 56px sticky navbar.

## Verification

- `cd backend && pytest` — 251 passed. `cd frontend && pnpm test` — 104 passed; `tsc` and `build` clean.
- The strengthened sensor test was confirmed to fail when `PointerSensor` is restored.
- Checked in the built CSS: `.grip` carries `touch-action: none`, its `display: none` sits inside the `@media (pointer: fine)` block and after the base rule, and both drag surfaces carry `user-select: none`.

**Only verifiable on a device:** press-and-hold a grip lifts the track with no selection or callout; dragging toward an edge scrolls the page; swiping anywhere else on a row still scrolls the list; tap still toggles the note; press-and-hold on `+` does not start a drag.
