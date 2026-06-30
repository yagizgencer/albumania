# Phase 18 — Dashboard plot height & even y-axis ticks

The detailed-view plot used its vertical space poorly (uneven, auto-spaced y
gridlines and a slightly short box). This phase enforces evenly spaced y ticks and
gives the plot more height. Pure frontend; applies to both the profile and friend
dashboards (shared `DashboardChart`).

## Frontend

- **`src/components/DashboardChart.tsx`**
  - Added `niceStep(range, targetTicks=5)` — returns a `1/2/5 × 10^n` step so the
    y-axis lands ~5 evenly spaced gridlines instead of Chart.js auto-spacing.
  - `yBounds` now rounds the padded min/max **down/up to whole steps** and returns
    a `stepSize`, so every gridline sits on a step multiple.
  - `scales.y` sets `ticks.stepSize` from that value. `maintainAspectRatio: false`
    already lets the canvas fill `.chartBox`.
- **`src/pages/ProfileDashboardPage.module.css`** — bumped `.chartBox` height
  `340px → 380px` (shared by both views, so detailed and overview stay equal) to
  address the "too little vertical space" feedback.

## Tests

- **`src/components/niceStep.test.ts`** *(new)* — unit-tests the step logic
  (0–10 → 2, 0–1 → 0.2, larger ranges scale up; non-finite/non-positive → 1; rounded
  bounds divide evenly by the step). Chart.js canvas rendering isn't exercised in
  jsdom, so the pure helper is unit-tested directly.

## Verification

- `cd frontend && pnpm test` → **15 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning only).
- Backend untouched.
- Manual at `localhost:5173` (owner to confirm): the detailed view's y-axis ticks
  are evenly separated and the plot fills the taller box, matching the overview.

## Notes

- No new libraries (Chart.js already in use).
