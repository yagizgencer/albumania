# Phase 19 — Dashboard table scroll, padding & sort icon

Stops the dashboard table from growing without bound, keeps the header visible
while scrolling, fixes inconsistent header padding, and keeps the sort icon aligned
on wrapped (multi-line) headers. CSS-only and applies to **both** dashboards — the
profile and friend pages share `ProfileDashboardPage.module.css` and the same
`SortableHeader`/table markup.

## Frontend

All changes in **`src/pages/ProfileDashboardPage.module.css`**:

- **`.tableWrap`** — replaced `overflow: hidden` with `max-height: 1100px` +
  `overflow-y: auto`, so the table scrolls internally (~25 rows) instead of
  growing the page.
- **Sticky header** — `.th` is now `position: sticky; top: 0; z-index: 2`, so the
  column headers stay pinned while the body scrolls (it already has a solid
  background).
- **Header padding** — split the combined `.table th, .table td` padding: data
  cells keep `0.55rem 0.6rem`; headers get a single, larger `0.75rem 0.9rem` on
  `.table th`. Removed the now-redundant `padding` from `.th` (which was being
  overridden by `.table th` anyway) so header spacing is defined in one place and
  no longer "doubled".
- **Sort icon on wrapped headers** — `.sortBtn` `align-items: flex-end → center`,
  so the sort glyph stays beside multi-line labels (e.g. the friend view's stacked
  "userA ↔ userB" similarity headers) instead of dropping to the last line.

## Verification

- `cd frontend && pnpm test` → **15 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Backend untouched.
- Manual at `localhost:5173` (owner to confirm, needs 25+ rated albums): the table
  scrolls internally with the header pinned, header padding looks even, and the
  sort icon stays aligned on the wrapped similarity headers in the friend view.

## Notes

- CSS-only; no new tests (no JS logic changed) and no new libraries.
- Single shared module means both dashboards pick up every change at once.
