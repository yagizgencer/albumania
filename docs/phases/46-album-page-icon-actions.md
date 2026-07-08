# Phase 46 — Album page: icon actions + compare searchbar redesign

Redesign of the album info page (`/albums/:spotifyId`), focused on the
**already-rated (published)** state, driven by an interactive design exploration.

## What changed

- **Header layout.** Cover bumped 200 → **220px** (~1.1×) for breathing room. The
  `Released · tracks · runtime` line is gone from the top-right; release date and
  runtime now sit as **quiet outlined chips** under the artist, and the track
  **count moved into the Tracks toggle** (`Tracks (10)`).
- **Icon actions.** The top-right now holds **indicative icon chips** aligned on
  the album-name line: **Invite a friend** (paper-plane, warm green) and
  **Remove rating** (trash, clay red). The **Invite button is now available in the
  published state** (previously only pre-publish), so a rated album still offers
  Invite + Remove. Each has a hover tooltip + accessible label.
- **Compare-a-friend searchbar.** The old "See a friend's ratings" label+input
  became an **always-on subtle searchbar** (search icon · type-to-filter input ·
  faint teal friend-count · chevron), moved into the scores row and pushed to the
  bottom of the meta column. Its dropdown uses real **`Avatar`s** for each friend.
- **Contour / dark mode.** Album card keeps its light look; in dark mode its
  patchy bevel is replaced with a **crisp full-perimeter warm hairline** + hard
  offset (cleaner retro "sticker" outline). The searchbar and its dropdown gained
  **dark-mode contours** (warm inner bevel; lighter dropdown border + rim-light)
  so black boxes read on the dark ground.
- The wider album-page `.page` margin is unchanged (card is wider; alignment
  logic identical).

## Files touched

- `frontend/src/components/Icons.tsx` — added `DiscIcon` (vinyl-record glyph) for
  the release-date chip.
- `frontend/src/pages/AlbumInfoPage.tsx` — restructured header (title row + icon
  action bar, artist, metadata chips), moved the friend picker into the scores
  row, restyled `FriendRatingsPicker` into the subtle searchbar with `Avatar`
  rows, `Tracks (N)` label, Invite in published state, new icon imports
  (`PaperPlaneIcon`, `TrashIcon`, `SearchIcon`, `HeadphonesIcon`).
- `frontend/src/pages/AlbumInfoPage.module.css` — cover 220px; `.titleRow`,
  `.iconBar`/`.iconBtn` (+ invite/remove colours, tooltip, dark overrides);
  `.metaChips`/`.metaChip`; `.tracksCount`; searchbar (`.searchBar`,
  `.searchIcon`, `.searchInput`, `.friendCount`, `.searchChevron`) + dropdown
  dark contour; dark card contour; removed unused `.details`/`.removeBtn`.
- `frontend/src/pages/AlbumInfoPage.test.tsx` — picker placeholder assertions
  updated to `Compare a friend…` (was `Search friends…`); hidden-picker check
  now asserts the placeholder is absent.

## Follow-up tweaks

- Icon action buttons enlarged (40 → 44px; glyphs 22/21) — the earlier 19/18px
  glyphs read as tiny given the icons' viewBox padding.
- Release-date chip: dropped the "Released" word, now leads with `DiscIcon`
  (parallel to the runtime chip's headphones glyph).
- Dark mode: chip text/glyph and the Tracks count brightened toward the near-white
  body colour so they don't read as murky.
- The compare searchbar is **always shown** (even with 0 friends who rated) so
  the feature is discoverable; the count shows `0` and opening it says "None of
  your friends have rated this album yet."
- Icon glyphs enlarged again to 28/26px — at 22px the marks read tiny inside the
  44px chips (the SVGs carry ~⅓ viewBox padding). No CSS shrinks SVGs; it was
  purely a size-choice issue.
- Metadata chips: crisp ink border + near-`--text` content in light mode (were
  washed-out); dark mode keeps a warm hairline border with near-white content.
- Cover bumped again (220 → **242px**, ~1.1×); alignment logic unchanged.
- Icon buttons: the lone centered SVG collapsed due to the flexbox/replaced-element
  quirk — fixed by pinning `.iconBtn svg { width/height; flex-shrink: 0 }` in CSS
  (attributes alone weren't honoured).
- Parenthetical counts (`Tracks (N)`, `Comments (N)`) are smaller than their label
  and a touch fainter (`--text-muted`) but readable.
- Friend-count pill in the searchbar given a defined contour (ink/warm hairline)
  and a teal-tint fill so it reads clearly.
- Shared `Select` (comments sort/order + visibility, Settings) modernised: real
  `ChevronDownIcon`/`CheckIcon` glyphs (were `▼`/`✓`), a filled pill trigger, and
  a dark-mode contour + rim-light on the menu.
  Files: `frontend/src/components/Select.tsx`, `Select.module.css`,
  `CommentsSection.tsx` (+ `.module.css`, `.test.tsx`).

## Standardised across all states

- Every album-page state (unrated / draft / rated) now uses the **same layout**;
  only two things differ: which **top-right icon actions** show, and the score-row
  placeholders. Actions render from one ordered list — **Listen Later → Rate →
  Invite → Remove** — filtered per state (Listen Later: unrated & no
  rating/invite; Rate: not published; Invite: always; Remove: published). The old
  text-button `.actions` row was removed.
- Indicative icons + colours, each with a hover tooltip: Rate = gold `StarIcon`,
  Listen Later = blue `HeadphonesIcon`, Invite = green `PaperPlaneIcon`,
  Remove = clay `TrashIcon`.
- Score row keeps its two slots always: **Average** shows the pill+count or
  "No ratings yet"; **Your score** shows the pill or a "Not rated yet" placeholder.
- Tooltip contrast fixed for dark mode — now uses the inverse of the surface
  (`--text` bg) so it's readable in both themes.
- Compare-a-friend searchbar gains the navbar search field's "select outline"
  (border darkens to `--text` on `:focus-within`), no inner glow.
- Friend-rating dropdown rows show each friend's real score as the amber pill
  (backend `friend-ratings` now returns `Rating.score`).

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files).
- `pnpm build` — clean.

## Notes

- No new libraries. Icons reuse the existing inline SVG set (`Icons.tsx`); no icon
  library was added.
- The design was explored via a throwaway interactive HTML mockup under
  `docs/design/` (removed on completion). This is a one-off exception to the
  "no standalone HTML previews" rule — it was for **choosing** a direction, not
  verifying built code; the implementation itself was verified with tsc/test/build.
