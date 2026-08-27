# Phase 62 — Album header, cover sizing, Top-5 stacking, density

Phase 61 fixed the icon-button and overflow defects, but the album page was still cramped, the rating editor's cover filled the screen, and the Top-5 podium wrapped 2+2+1. The reference point given was the **artist page**, which looks right on a phone.

## Two mistakes of mine, recorded so they aren't repeated

**1. The `132px 1fr` override.** Phase 60 added, at the phone tier:

```css
@media (max-width: 560px) { .headerTop { grid-template-columns: 132px 1fr; } }
```

deliberately overriding the *existing* 720px single-column collapse, to stop the cover going full-bleed. That left a **194px** meta column at 390px which had to hold the title, three action buttons, the artist, two chips (~260px) and the compare bar (~275px). Two of those cannot fit at any size. The fix for "cover too big" created "text column too narrow" — the two failure modes this kept oscillating between. The correct answer is **both**: a single-column-ish layout *and* a capped cover.

**2. Measuring against the wrong box.** Phase 61's commit justified the icon bar as "144px in a 338px card". The bar does not live in the card — it lives in that 194px column, sharing a flex row with the title. Worse, phase 61 removed `flex-shrink: 0` while adding `flex-wrap: wrap`, which drops a flex item's automatic minimum to its widest child (40px) and made the bar the *most* compressible thing on the row. Flex then crushed it to one or two chips per line. **When checking whether something fits, measure it against its actual containing block, not the nearest convenient ancestor.**

## Why the artist page works

Its header is a flex row with **exactly two children** — a `flex-shrink: 0` avatar (120px → 76px on phones) and the title. Nothing competes for width, there is no card chrome, and its text column is 278px against the album page's 194px. Its album grid is `repeat(auto-fill, minmax(140px, 1fr))`: intrinsically responsive, no breakpoint arithmetic. That is the shape copied below.

## Changes

### Album header — `AlbumInfoPage.module.css`

At the phone tier the header becomes a grid with named areas. `.meta`, `.headline` and `.titleRow` are layout-only wrappers (no background, border or role), so `display: contents` promotes their children into that grid — **no TSX change**:

```
"art     title"
"art     artist"
"actions actions"
"chips   chips"
"stats   stats"
```

A 116px cover sits beside the title and artist; the buttons, chips and score blocks each get their own full-width row. At 390px every one of them now fits in the 342px card (previously the chips and compare bar could not fit in 194px).

`.iconBar` gets `flex-shrink: 0` back and loses `flex-wrap` — once it owns a row, 140px fits comfortably and the buttons stay on one line.

`.friendRatings` gets its own `min-width: 0; width: 100%`. Investigation showed the compare bar was *not* in fact overflowing — `.searchInput { min-width: 0 }` already cuts the `<input>`'s intrinsic minimum — but it only fitted by relying on a grandchild's rule. Now it is full width by construction.

**`AlbumDetailPage`** keeps its two-column header: its DOM differs (chips nested inside `.headline`) and it carries one action button and one chip, so the narrow column genuinely fits. Only its cover size was aligned.

### Shared cover — `styles/blocks.module.css`

Four pages hand-rolled the same cover decoration. Added a `.cover` block (radius, border, shadow, `object-fit`, hover lift) adopted by `AlbumInfoPage .art`, `AlbumDetailPage .art`, `ListenLaterPage .qcover` and `RatingEditorPage .cover` via `composes`. `AlbumCard .art` uses a different idiom (no border, container-query sized) and stays separate.

The block also carries a `max-width` backstop at the tablet and phone tiers. Sizing is otherwise local — each consumer is capped by a different mechanism — but the rating editor had **no cap at all**: its `360px 1fr` grid collapses to `1fr` at 880px and nothing re-bounds the image, so `.cover { width: 100% }` rendered **338×338 at 390px, 87% of the viewport**. The 560–880 band was equally affected, so the cap is not phone-only.

> Ordering gotcha worth knowing: a composed class lands *later* in the bundle than the composing page's own rules. The shared `.cover { width: 100% }` therefore beats any per-page `width` at equal specificity. Both album headers now size the cover through their **grid track** instead, so the 100% simply resolves to it.

### Top 5 — `RatingEditorPage.module.css`

`.slot { min-width: 130px }` → `min-width: 100%` at the phone tier. With `.podium` already wrapping, that guarantees one slot per line, and the track name gets ~250px instead of ~42px. (`flex-direction: column` would have been the other route, but then `.slot`'s `flex: 1` starts resolving against the height axis.)

### Density — `index.css`

Another step down on the phone tier: `--space-3/4/5/6/8` tightened (12→10, 16→13, 16→14, 20→17, 28→24). **Spacing and chrome only** — body text is already at its legibility floor and was left alone, per the convention added in phase 61.

## Verification

- `cd backend && pytest` — 251 passed. `cd frontend && pnpm test` — 104 passed; `tsc --noEmit` and `build` clean.
- Checked in the **built** CSS: no `132px 1fr` remains, the header grid-areas and both `display: contents` promotions are present, the shared `.cover` carries both caps, `.slot` resolves to `min-width: 100%`, `.iconBar` is back to `flex-shrink: 0`, and every phone override sits *after* its base rule.

**Still to do by hand:** the desktop regression pass at ≥1280px. The grid-areas and `display: contents` are inside the ≤560 block, but the `.iconBar` flex change, the shared cover block and the spacing tokens touch shared rules.
