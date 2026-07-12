# Phase 54 — Light borders in dark mode (flip the global `--border` token)

The "Warm Peach Pro" theme used one near-black `--border` token for every border
and line in both themes. In dark mode that near-black outline sank into the dark
surface — profile pictures, score badges, status pills, and even card/input edges
lost contrast. Fixed by making **dark-mode `--border` a warm "kırık beyaz" (broken white)** so
every consumer lifts to a light ink at once. Light mode is untouched; the faint
`--border-soft` dividers are unchanged. The **dark-mode sticker shadows are left
as they were** (the original warm-bevel + hard `#000` offset scheme) — that retro
look was liked, so the change is deliberately scoped to the border color only.

## Frontend

- `frontend/src/index.css` — in `[data-theme="dark"]`:
  - `--border: #0f0b08` → `--border: #c4b8a2` (a warm, dimmed broken-white,
    darker than `--text: #ece0cf` so edges read as edges, not bright lines).
  - Overrode `--border-w: 2px` and `--border-w-thin: 1px` (down from the shared
    `3px` / `2px`): a bright line at the light-mode width read too heavy on the
    dark ground, so every token-driven border is a touch thinner in dark mode.
  - Light-mode `--border` (`#2e2620`), the shared border widths, and the dark-mode
    `--shadow-*` tokens are unchanged.
- `frontend/src/pages/ListenLaterPage.module.css` — `.scoreSticker` (completed-card
  corner score) gets a dark-mode `box-shadow` that keeps only the warm inset bevel
  and drops the hard `3px 3px 0 #000` offset: the sticker is flush into the card's
  bottom-right corner, so that black offset poked past the card's top/right edges
  and read as a black corner in dark mode.
- `frontend/src/components/AlbumCard.module.css` — `.badgeDisabled` used
  `background: var(--border)` as a **fill** (a disabled score disc); repointed to
  `var(--surface-muted)` so it stays a muted grey in dark mode instead of flipping
  to the light ink.
- `frontend/src/pages/AlbumDetailPage.module.css` — removed the now-redundant
  local `--avatar-ring-dark: var(--text)` variable and its two dark overrides
  (`.simAvatarLink > span`, `.simSpotify`); the global token now handles the
  comparison-page avatar + Spotify-circle rings.
- `frontend/src/components/NavBar.module.css` — removed the `.profileBtn > span`
  dark `border-color: var(--text)` override; the profile-avatar ring inherits the
  flipped token.
- `frontend/src/pages/ListenLaterPage.module.css` — removed the
  `.lwAvatar` / `.lwMore` dark override (a `color-mix(--text 52%)` hairline); both
  now follow the global token.
- `frontend/src/pages/AlbumInfoPage.module.css` — dropped the redundant
  `border-color: var(--border)` re-pins from the `[data-theme="dark"]`
  `.statCount` and `.friendCount` rules (kept their bg/text swaps); the hairline
  now follows the global token.

## Notes

- CSS-token change only — no component markup or TS touched.
- Considered an alternative name/approach: a separate `--border-light` token
  applied per small-element selector (avatars/badges/pills only). Rejected after
  the user confirmed the intent is "everywhere light mode uses black, dark mode
  goes lighter" — flipping the single `--border` value is simpler, covers every
  border and line, and needs no per-selector sweep.
- Out of scope / deliberately kept: `--border-soft` (both themes); the intentional
  literals `HomePage.module.css:132` (`#2e2620` CTA over an image) and
  `ImageLightbox.module.css:105` (`#fff` close ring).

## Follow-up polish (artist page, add-badge, dashboard photo + date picker)

- `frontend/src/pages/ArtistPage.module.css` — added
  `border: var(--border-w) solid var(--border)` to `.avatar`/`.avatarPlaceholder`
  so the artist header photo carries the sketch outline in both themes (it had
  none).
- `frontend/src/components/AlbumCard.module.css` — `.badgeBtn:hover` now sets
  `color: var(--on-primary)`. On hover the badge fills coral (`--primary`); the
  resting `--text-muted` glyph vanished on coral in dark mode, so the "+" is now
  dark ink that reads on coral in both themes.
- `frontend/src/pages/ProfilePage.module.css` — removed
  `box-shadow: var(--shadow-soft)` from `.avatar` (the dashboard/profile header
  photo) so it sits flat.
- **Date filter → custom `<DatePicker>` component.** The native
  `<input type="date">` was replaced entirely. Its calendar pop-up is drawn by
  the browser and only follows the OS light/dark (via `color-scheme`), so it
  could never match the in-website theme toggle or the cozy Warm Peach look. New
  files:
  - `frontend/src/components/DatePicker.tsx` — a writable text field + a calendar
    button that opens our own themed popover, modeled on the custom `<Select>`
    (same outside-click / Escape / focus conventions). Takes/emits an ISO
    `"YYYY-MM-DD"` string (drop-in for the existing `fromDate`/`toDate` state).
    Features: type a date as `DD.MM.YYYY` (lenient `. / -` separators, validated
    on blur/Enter and reverted if invalid/out-of-range); month + year quick-select
    dropdowns to jump without clicking arrows; optional `min`/`max` props that
    disable out-of-range days and reject out-of-range typed dates (month-nav
    arrows stay always-available — the range only limits day selection);
    Monday-first grid, Today/Clear quick links.
  - `frontend/src/components/DatePicker.module.css` — mirrors `Select.module.css`:
    surface trigger with a soft hairline (flat, no shadow, teal focus ring), a
    flat popover (`--border-soft` hairline in dark), teal "selected" day with the
    sketch border, month title in the `--font-display` handwritten face, dates in
    the body font with `tabular-nums` (the earlier native field rendered the date
    oddly). Fully token-driven, identical in light and dark. Polish: the field's
    inner input suppresses the global `input:focus` ring so only the wrapping
    `.field` shows one ring (no double highlight while typing); month-nav arrows
    are purpose-drawn ‹/› chevrons whose
    path is centred in the 24×24 box (both a `‹`/`›` text glyph and a rotated
    down-chevron sat off-centre); day cells centre a fixed 2rem pill inside
    each grid track so the selected teal fill has even breathing room and never
    hugs a neighbour or the popover wall.
  - `frontend/src/lib/date.ts` — added `todayIso()` helper.
  - `frontend/src/pages/ProfileDashboardPage.tsx` + `FriendDashboardPage.tsx` —
    swapped both From/To native inputs for `<DatePicker>`, wired with constraints:
    both capped at `todayIso()` (no future dates), To gets `min={fromDate}` and
    From gets `max={toDate || today}` (so the range can't invert).
  - `frontend/src/pages/ProfileDashboardPage.module.css` — deleted all the native
    `input[type="date"]` styling (calendar-indicator data-URI SVGs, datetime-edit
    resets, `color-scheme`); the shared `select` / `input[type="text"]` field
    styling stays for the artist-name filter.

## Dark-mode error text (login / register / profile)

- `frontend/src/index.css` — the global `.error` class (bare validation/error text
  on the page) used `--danger-text`, which is tuned to sit on the Alert's light red
  `--danger-bg` fill and goes near-black/invisible on the dark page. Added a
  `--danger-on-surface` token (`#8a2f2f` light / `#ef9d9d` dark) and pointed `.error`
  at it. The `<Alert>` component is unchanged (still `--danger-text` on
  `--danger-bg`). Fixes the register field hints and the ProfilePage error line.

## Verification

- `cd frontend && pnpm tsc --noEmit` — clean.
- `cd frontend && pnpm test` — 82 passed.
- `cd frontend && pnpm build` — green.
- Manual (dark mode): lighter edges now read on avatars (NavBar/Friends/Profile),
  score badges (AlbumCard grid, Album Info, comparison page), status pills
  (ListenLater), inputs, buttons, cards, and lines; disabled score badge stays a
  muted disc; sticker shadows still give cards/buttons depth. Light mode unchanged.
- Manual (follow-up): artist photo has a border in both modes; the "+" add badge
  stays visible on hover in dark mode; the dashboard profile photo has no shadow;
  the date-filter calendar icon is visible and on-brand in both light and dark.
