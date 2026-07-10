# Phase 47 — Rating editor redesign ("Balanced" layout)

Full visual redesign of the rating editor (`/albums/:spotifyId/rate`), driven by
an interactive design exploration. The old page (single column: score slider,
two-column drag grid with **5 position buttons per track**, per-track note
textareas always visible, text action buttons) was outdated and inconsistent with
the Warm Peach Home/Album pages. Replaced with a calmer two-card layout.

## What changed

- **Two-card layout, standardized widths.** `.page` now uses the same
  `max-width: min(93vw, 1560px)` / `0 0.35rem` side margins as Home and Album. A
  `360px | 1fr` grid: a **sticky left card** (cover, title, artist·year, runtime
  chip, score, icon actions) and a **right card** (Top 5 · Tracks · comment).
  Both use the standardized Album-page sticker `.card` (+ dark hairline contour).
- **Score.** A single amber "point" **score pill** (`--data`) + a custom-styled
  slider (thin inked track, round amber thumb) — replaces the plain range + big
  number. Shows `—` until first set.
- **Top 5 = drag podium.** The **5 position-buttons-per-track grid is gone.** The
  Top 5 is a horizontal strip of 5 ranked medal slots; you **drag a track onto a
  slot** (or **click a pool row** to fill the next open slot). Slots reorder by
  dragging one onto another; each filled slot has an **always-visible ✕**. Medals
  are gold/silver/bronze for 1–3 and **teal (4th) / coral (5th)** so they don't
  clash with the amber score.
- **Tracks — collapsible, expanded by default.** Mirrors the Album page's
  `Tracks (N)` chevron toggle (just "Tracks", the count lives in the parens). The
  list sits in a **faint inset bordered panel** for a bit more contour/separation
  from the rest of the card. Tracks already in the Top 5 render as a faded,
  non-draggable row showing their `#rank`.
- **Notes.** Per-track note is now a **pencil toggle** (hover-revealed; stays lit
  when open) that expands an inline textarea — replaces the always-on textareas.
  Tracks that load with a saved note start expanded.
- **Comment.** Reuses the real **`CommentComposer`** (controlled field mode: B/I/☰/😊
  toolbar + Visibility dropdown + counter), shown only for unpublished ratings.
- **Actions = icon buttons.** Save / Publish / Remove are now Album-page-style
  **icon chips with hover tooltips** (blue save, green publish, clay trash) instead
  of text buttons; Publish's tooltip carries the gating reason when disabled.
  Remove opens an inline confirm. No more "Draft/Published" badge.

All rating logic is unchanged (load-or-create draft, score/top-5/notes state,
`serialize`/dirty detection, unsaved-changes guard, save/publish/remove, pending
programmatic nav). Drag still uses the existing `@dnd-kit`; a `{ distance: 6 }`
pointer activation constraint lets a plain click on a row add-to-next-slot without
starting a drag.

## Files touched

- `frontend/src/pages/RatingEditorPage.tsx` — rewritten render + drag components
  (`SlotName`, `TopSlot`, `TrackRow`); podium strip, collapsible tracks (default
  open), pencil note toggle (`openNotes` set), amber score pill/slider, icon action
  bar + inline remove confirm, hourglass runtime chip, `CommentComposer` in the
  right card. Removed the 5-slot buttons, `RestZone`/`RestPlaceholder`.
- `frontend/src/pages/RatingEditorPage.module.css` — rewritten: `.grid`, sticky
  `.leftCard`, standardized `.card` (+ dark), cover, `.metaChip` (hourglass),
  amber `.scorePill`/`.scoreRange`, `.iconBtn` (+ save/publish/remove colours &
  dark overrides), inline `.confirm`, podium `.slot`/`.medal` (teal 4th / coral
  5th)/`.xBtn`, collapsible `.tracksToggle`/`.chevron`, inset `.trackList` panel,
  `.trk`/`.rankPill`/`.note`/`.noteBox`, drag `.overlayCard`.
- `frontend/src/components/Icons.tsx` — added `SaveIcon` (floppy disk) for the
  save-draft action.

## Follow-up tweaks

- **Both meta chips** like the Album page: a **`DiscIcon` release-date chip** (full
  `formatDate`) alongside the hourglass runtime chip; the artist line dropped the
  year (it lives in the disc chip now).
- **Score slider no longer "vibrates."** The amber pill had variable width as the
  digits changed, resizing the flex slider beside it. Pill is now a **fixed 5.75rem,
  centered, tabular-nums**, and the slider is `flex: 1; min-width: 0` — its size and
  position are stable while dragging.
- **Spacing** added before the Tracks toggle and the "A few words" head: the
  right-card `.hr` dividers now carry `var(--space-4)` vertical margin (the left
  card keeps `margin: 0` and spaces via its flex gap).
- **Note toggle always visible + presence indicator.** The pencil is now an
  always-shown bordered chip (was hover-only). A saved note shows a **teal accent +
  a corner dot**; tooltip/label switch Add note → Edit note → Hide note. Rows in the
  Top 5 are de-emphasised via muted label colour (not `opacity`) so the note chip &
  dot stay crisp.
- **Top-5 remove button** restyled professionally: a clean circular icon button
  using a new **`CloseIcon`** (X) glyph, properly centered (was a mis-aligned `✕`
  text character), reddening on hover.
- Added `CloseIcon` to `Icons.tsx`.
- **Comment hint** moved out of the section head and into the textarea placeholder:
  `Share your thoughts on this album… (optional, posted when you publish)`.
- **Removed** the "drag favourites up here" hint from the Top 5 head.
- **Drag overlay follows the cursor centred** regardless of grab point — an inlined
  `snapCenterToCursor` modifier (standard `@dnd-kit/modifiers` helper, reimplemented
  with `getEventCoordinates` from the already-installed `@dnd-kit/utilities` to avoid
  a new dependency). The overlay card fills the wrapper so it visually centres.
- **Note/× buttons are now opaque** (`--surface` fill instead of transparent) so they
  read as solid controls.
- **Drag overlay is now a compact chip** (~slot-sized pill, `max-width: 240px`)
  centred on the cursor, instead of a full-row-width card that was hard to aim — a
  centering wrapper fills dnd-kit's row-sized overlay box so `snapCenterToCursor`
  lands the small chip on the pointer.
- **Tracks now render in two columns** (first half | second half) inside the inset
  panel, so rows — and the drag source — are narrower. Each column is its own list
  (a track + its note stay together; columns don't couple row heights). Collapses to
  one column under 620px.
- **More contour on the Tracks panel** (both themes, subtle): solid `--surface-muted`
  fill (vs the card), a slightly deeper border + faint inset in light; a warm hairline
  + top rim-light in dark. Row hover lifts to `--surface` so it still reads against the
  muted panel.
- **Dark-mode form nudge** (subtle): slightly lighter outlines on the note/× buttons,
  the row separators, and the empty/filled podium slot borders (mixed a touch toward
  `--text-subtle`); row separators strengthened `55% → 66%` in both themes.
- **Album-page header parity:** the cover is now an **`ImageLightbox`** (click to
  expand full-screen), the **album title links** to `/albums/:id`, the **artist links**
  to `/artists/:id` (when known), and a **clickable Spotify pop-out** (external-link
  arrow + Spotify mark, `Open on Spotify` tooltip) sits after the title — all reusing
  the Album page's components/markup and `.headerLink`/`.spotifyLink` styles.

- **Lightbox transparency fix** (shared): the enlarged image showed the dimmed page
  through transparent (PNG) source images. Gave the enlarged `<img>` a solid white
  backing in **`ImageLightbox`** (album + rating cover expand) and the profile
  **`AvatarLightbox`** so the expanded view reads as an opaque photo.
- **Slider track contour lightened**: softened toward the surface in light (gentle
  chip-like hairline) and toward the warm ink in dark for visibility.
- **Lightbox portalled to `<body>`** (`ImageLightbox`): the rating page's sticky
  left card creates a stacking context that trapped the `position: fixed` overlay
  behind other content (reading as "transparent / not in front"). Rendering the
  overlay through `createPortal(..., document.body)` frees it to cover everything.
- **Slider "selected" state de-greened**: the global teal input focus-glow around
  the whole slider is removed; on focus the amber thumb brightens with a soft warm
  halo instead.
  Files: `frontend/src/components/ImageLightbox.tsx`,
  `frontend/src/components/ImageLightbox.module.css`,
  `frontend/src/pages/ProfilePage.module.css`.

- **Interaction refinements:** a **Reset** button on the Top 5 head (clears all slots),
  a **Show/Hide all notes** toggle on the Tracks head, and the per-row pencil replaced
  by an explicit **“Add to Top 5” (+)** button. **Clicking a track row now opens/closes
  its note** (drag still ranks, separated by pointer activation distance); rows with a
  saved note show a small teal comment glyph. New icons used: `PlusIcon`, `CommentIcon`
  (pencil removed).

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files); `RatingEditorPage.test.tsx` (publish call,
  unsaved-changes guard) green against the new markup.
- `pnpm build` — clean.
- Backend untouched (no schema/endpoint change), so `pytest` not required.

## Notes

- No new libraries. `SaveIcon` reuses the existing inline-SVG set; `HourglassIcon`
  and `CommentComposer` are reused as-is.
- Direction was chosen via throwaway interactive HTML mockups under
  `design-explorations/` — a one-off exception to the "no standalone HTML previews"
  rule, used for **choosing** a direction, not verifying built code (that was done
  with tsc/test/build). Safe to delete.
