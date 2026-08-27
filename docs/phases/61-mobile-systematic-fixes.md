# Phase 61 — Fix the mobile UI systematically

Four screens were reported broken on a phone: the album header overflowed the card *and* the page, the profile header stranded a lone edit button on its own row, the Top-5 podium crushed five slots into one row with shattered placeholder text, and the friends grid spent a whole screen on two usernames.

Phase 60 and its follow-ups fixed symptoms one page at a time. This phase found why that treadmill never ended: **the four symptoms shared three global defects.**

## The three global defects

### 1. There was no `box-sizing: border-box` reset anywhere

`index.css` is the only global stylesheet, and its `*` rule set scrollbar properties only. Every `width` in the app was content-box, so padding and borders were added *on top* — meaning any `width: 100%` element with padding overflowed its parent. Eight modules had a one-off `box-sizing: border-box` to work around its absence.

Fixed with the standard reset; the eight workarounds were deleted.

### 2. The global `button` padding leaked into every icon button

`button { padding: 8px 16px }` applies to any `<button>` that doesn't reset it. Combined with (1), a `.iconBtn` declaring `width: 40px; height: 40px` actually rendered **76×60px**. This was live in six classes across five pages.

On the album header it was the primary overflow: the action row measured **252px inside a 194px column**, was `flex-shrink: 0`, and could not wrap. After the fix it is **144px in a 338px card**.

This is the third time this exact defect has been fixed — `NavBar .item` in `3ba0055`, and before that the same class of bug elsewhere. It is now fixed at source in a shared block so it cannot recur.

### 3. Eight headings never scaled on phones

They used `clamp(Xrem, small-vw, Yrem)` where the `vw` term only overtakes the floor above **892–1013px** — so on every phone they rendered at full desktop size. The album title was 33.6px in a 194px column; page titles 30.4px. Retuned so each reaches its floor around ~360px instead.

(`AuthLayout .heroTitle` still reads as "dead" to a naive scan, correctly: it lives inside `.hero`, which is `display: none` below 820px.)

## Shared blocks — the modular part

`PageContainer` was imported by **zero** pages and `Card` by one, while 10 pages hand-rolled a `.page` wrapper and 18 blocks hand-rolled the same card. That is why every mobile fix had to be repeated per page.

New **`frontend/src/styles/blocks.module.css`** defines each block once, consumed via CSS Modules `composes` so **no TSX changes were needed**:

```css
.iconBtn {
  composes: iconButton from "../styles/blocks.module.css";
  width: 40px;
  height: 40px;
}
```

- `.page` — content column with responsive gutters.
- `.card` — the sticker surface, as a `container-type: inline-size` size container carrying `--card-px` (the scaling convention proven on the queue card in phase 60).
- `.iconButton` — fixed square with the load-bearing `padding: 0` and a 44px hit area.

Adopted for the six icon-button classes; every per-page rule now carries **only** its size. Verified in the built CSS that no page rule redeclares padding.

## Files touched

| File | Change |
|---|---|
| `frontend/src/index.css` | Global `box-sizing: border-box` reset; `overflow-x: clip` backstop on `body` (`clip`, not `hidden`, so it doesn't create a scroll container and break `position: sticky`) |
| `frontend/src/styles/blocks.module.css` *(new)* | The three shared blocks |
| `AlbumInfoPage`, `AlbumDetailPage` (`.module.css`) | `.iconBar` wraps; `.iconBtn` composes the block; `h1` gets `min-width: 0` + `overflow-wrap: anywhere` (as a flex child it refused to shrink below its longest word); retuned title clamp; deleted the dead `.titleBlock` rule |
| `ProfilePage.module.css` | Removed the `@media (max-width: 640px)` rule that set `.headerActions { grid-column: 1 / -1 }` — that was exactly what stranded the pencil on its own row; avatar 104→68px on phones |
| `RatingEditorPage.module.css` | Restored a `min-width` floor on `.slot` (phase 60's `min-width: 0` is what collapsed all five onto one row); `.slotPh` truncates like `.slotName`; smaller medal; `touch-action: manipulation` on draggables |
| `RatingEditorPage.tsx` | **Registered `TouchSensor`** with `{ delay: 200, tolerance: 5 }` |
| `FriendsPage.module.css` | Phone tier renders the grid single-column with `.fcard` in the same `auto 1fr auto` row shape as the request rows; 72→40px avatar |
| 7 modules | Removed now-redundant `box-sizing` declarations |
| `RatingEditorPage.test.tsx` | Test asserting a `TouchSensor` is registered with a delay constraint |

## Drag and drop was genuinely broken on touch

Worth recording separately, because it was a functional bug and not a layout one. Only `PointerSensor` (activation `{ distance: 6 }`) and `KeyboardSensor` were registered. On a phone the 6px of movement that would activate the pointer sensor is the same movement that starts a page scroll, and the scroll always wins — so the Top 5 could not be reordered at all. The only touch path was the `+` button, which fills the next open rank and cannot reorder.

`TouchSensor` with a **delay** constraint is dnd-kit's documented mobile pattern: holding briefly picks the track up, a quick swipe still scrolls. Paired with `touch-action: manipulation` on the draggables.

## Verification

- `cd backend && pytest` — 251 passed.
- `cd frontend && pnpm test` — 104 passed (25 files, 1 new). `tsc --noEmit` and `build` clean.
- The new sensor test was confirmed to **fail** when `TouchSensor` is removed, so it actually guards.
- Checked in the built CSS: the reset is present, the shared block carries `padding: 0`, no per-page icon-button rule declares padding, `overflow-x: clip` is applied, `.iconBar` wraps, and the podium slot floor is in the phone tier.

**Still to do by hand:** the desktop regression pass at ≥1280px. The `box-sizing` reset is global, and although almost every affected element gets *smaller or unchanged* (borders and padding now sit inside declared widths), any layout that was compensating for content-box could shift. Check the album, profile, friends, rating editor and home pages against production before considering this done.
