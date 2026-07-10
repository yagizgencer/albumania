# Phase 49 — Profile page redesign (album-style header)

Visual redesign of the profile page (`/profile/:username`) to match the Album /
Listen & Rate / Rating pages, chosen from a design exploration ("Album-style
header"). Same functionality, better looking and consistent; **one layout for every
profile variant** (self / other / friend / pending / private), differing only in the
top-right action and the compare control.

## What changed

- **Header = album-style sticker card.** `auto | 1fr | auto` grid: clickable
  **avatar** (104px, sketch border + offset shadow, opens the lightbox), the info
  column (display-font **name**, **@username**, markdown **bio**, **meta chips**),
  and the top-right **actions**. Dark gets the clean hairline+offset shadow.
- **Edit is now an icon** (blue `PencilIcon` `.iconBtn` with an "Edit profile"
  tooltip) instead of a text button — opens the same inline editor.
- **Meta chips** replace the old plain lines: **Member since** with a new
  `CalendarIcon`, and the **Friends-only** privacy indicator as an amber `LockIcon`
  chip (still shown only when the viewer can't see the dashboard).
- **Friendship button** keeps all four states but swaps emoji glyphs for real icons:
  Add friend (`PeopleIcon`), Request sent (`HourglassIcon`), Accept (`CheckIcon`) +
  Decline (`CloseIcon`), and Friends (`CheckIcon`, unfriend confirm) — via the shared
  `Button`/`ConfirmButton`.
- **"Compare with" combobox** restyled to the album friend-picker searchbar: pill
  search bar (search icon · input · clear · chevron) + a Warm-Peach dropdown (Spotify
  option + friends, selected row highlighted). Same `role="combobox"`/`role="option"`
  wiring, so behaviour/tests are unchanged.
- **Dashboard section** framing updated (display-font "Dashboard" title); the real
  `ProfileDashboard` / `FriendDashboard` and the friends-only `PrivateNotice` are
  untouched. The avatar lightbox keeps its opaque-image fix; its buttons got the
  sticker look.

## Files touched

- `frontend/src/components/Icons.tsx` — added `CalendarIcon`, `LockIcon`.
- `frontend/src/pages/ProfilePage.tsx` — album-style header markup, icon Edit,
  meta chips, icon'd friendship states, restyled `FriendCombobox` (searchbar +
  chevron + clear); logic (friend state, compare source, dashboard selection,
  editor, lightbox) unchanged. New icon imports.
- `frontend/src/pages/ProfilePage.module.css` — rewritten to the sticker card,
  meta chips, `.iconBtn`, album searchbar/dropdown, editor, private notice, and
  lightbox styles (+ dark overrides).

## Follow-up tweaks (dashboard)

- **Page width** now matches Listen & Rate / Album (`min(93vw, 1560px)`): ProfilePage
  renders its own `<main class="page">` instead of `PageContainer width="wide"`
  (which was narrower at 1320px). Avatar bumped to 104px (via the `size` prop, since
  it wins over CSS).
- **Metric / View toggles** use a new **`pill`** `Tabs` variant — a clean rounded
  segmented control (soft container, teal active pill, no hard offset shadow) instead
  of the blocky bordered bar. (`Tabs.tsx`/`Tabs.module.css`, `MetricSwitch.tsx`.)
- **Sortable column headers**: dropped the global button hover nudge/shadow; they now
  carry a **slight underline** (strengthens on hover, accent when the column is the
  active sort) to read as clickable — more professional, less blocky. Numeric columns
  are **centre-aligned** (header + values) so titles sit over their content.
- **Chart x-axis album names are clickable + hoverable** in detailed mode: the chart's
  `onClick`/`onHover` map a click/hover below the plot to the album index under that
  tilted label (pointer cursor + navigate), via a new `axisLabelIndexAt` helper in
  `DashboardChart.tsx`.

## Follow-up fixes (dashboard, round 2)

- **Sort headers de-boxed:** the sort buttons were still getting the global `button`
  offset shadow at rest — added `box-shadow: none` (+ `border-radius: 0`). The header
  row now uses the table fill (`--surface`) with a `--border-soft` underline instead
  of filled `--surface-muted` boxes.
- **Numeric columns actually centre now:** `.numCell` / `.thCenter` (specificity
  `0,1,0`) were being overridden by `.table td` / `.table th` (`0,1,1`) — switched to
  compound `.table td.numCell` / `.table th.thCenter`.
- **X-axis album labels clickable/hoverable (detailed):** the click handler checked
  `elements` first, but `nearest`/`intersect:false` always reports a nearest point, so
  the label branch never ran — now `axisLabelIndexAt` is checked **first**, and hover
  sets a pointer cursor over labels.
- **Compare control moved into the controls box:** it's passed from `ProfilePage` as a
  `compareSlot` into `ProfileDashboard` / `FriendDashboard`, rendered right-aligned in
  the filters row (not floating above next to the "Dashboard" heading). Test mock
  updated to surface the slot.
  Files: `ProfileDashboardPage.tsx`/`.module.css`, `FriendDashboardPage.tsx`,
  `DashboardChart.tsx`, `ProfilePage.tsx`, `ProfilePage.test.tsx`.

## Follow-up fixes (dashboard, round 3)

- **Compare control:** the weird inner box was the dashboard's `.controls
  input[type="text"]` rule styling the compare searchbar's input (now that it lives in
  the controls box) — scoped that rule to `.controls label input` so it only hits the
  filters. The compare control now stacks its **label on top** (like the other filters)
  and the searchbar is smaller (`min-width` 15rem → 13rem, tighter padding).
- **Chart tooltip only near a point:** interaction was `intersect: false` (snapped to
  the nearest point from anywhere) → now `intersect: true` with a small point
  `hitRadius`.
- **Custom HTML tooltip:** replaced Chart.js's canvas tooltip with an external HTML one
  (`.chartTooltip`) so the **album name reads as an underlined link** above the value.
- **X-axis labels** hover/click confirmed via the reordered `axisLabelIndexAt` (detailed
  view): pointer cursor + navigate.
- **Column titles** bumped a bit (`.th` 0.8rem → 0.92rem).
  Files: `ProfileDashboardPage.module.css`, `DashboardChart.tsx`,
  `ProfilePage.module.css`.

## Follow-up fixes (dashboard, round 4)

- **Underline moved to the x-axis:** removed the tooltip album-name underline; instead
  the **hovered x-axis album label is underlined** (detailed view) via a Chart.js plugin
  that reuses Chart.js's own computed label geometry (`_labelItems`) so the line sits
  under the tilted text. Redraws only when the hovered label changes (via `chart.draw()`
  + a `mouseleave` reset); pointer cursor + click still navigate.
- **Standardized to the app's sticker cards:** the dashboard `controls`, `chartCard`,
  and `tableWrap` now use `border-w` + `radius-lg` + offset shadow (with the dark
  hairline+offset override), matching the Album / Listen / Rating cards.
- **Dark-mode field outlines:** the filter inputs (Artist/album, From, To) get a
  lighter border in dark (`border-soft`→`text-subtle` mix) so they keep their form; the
  overview zoom/pan `toolBtn`s got a pill shape + `border-soft` (visible in dark).
  Files: `ProfileDashboardPage.module.css`, `DashboardChart.tsx`.

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files); the 2 ProfilePage combobox tests green.
- `pnpm build` — clean.

## Notes

- No new libraries. New icons reuse the inline SVG set.
- Direction chosen via a throwaway HTML mockup under `design-explorations/` (the
  stat tiles there were placeholder filler — the real dashboard is unchanged).
