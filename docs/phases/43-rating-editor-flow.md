# Phase 43 — Rating editor flow: publish-redirect, unsaved guard; dashboard remove; drop "Rated"

## Context

Four rating/dashboard UX fixes (frontend):

1. Publishing should **leave the editor** and return to wherever it was opened from.
2. Leaving the editor with **unsaved edits** should prompt (Save & quit / Quit /
   Cancel), plus warn on tab-close/refresh.
3. The **Remove-rating** control should also exist on the dashboard album detail
   pages; removing there redirects to my profile (the detail view is gone).
4. The greyed-out disabled **"Rated"** button on the album page is removed.

## 1. Publish redirects to origin

- The two callers now pass an origin in router state: `AlbumInfoPage.handleRate`
  → `{ from: "/albums/<id>" }`; the Listen Later Rate link → `{ from: "/listen-later" }`.
- `RatingEditorPage` reads `location.state.from` and computes
  `origin = from ?? /albums/<spotifyId>` (album-page fallback). `handlePublish`
  navigates to `origin` after a successful publish (staying only if the optional
  comment post fails, so the message is visible). `handleRemove` also leaves to
  `origin` (was `/`).

## 2. Unsaved-changes guard

- Dirty tracking via a serialized snapshot of the editable state (score/hasScore/
  top slots/notes), reset by `applyRating` (load/save). `isDirty` also true when
  the publish comment box has text. An `isLeavingRef` bypasses the guard for our
  own programmatic publish/remove navigations.
- In-app nav: `useBlocker` → a custom modal with **Save & quit** (`handleSave`
  then `blocker.proceed`), **Quit without saving** (`blocker.proceed`), **Cancel**
  (`blocker.reset`).
- Tab close / refresh: `useBeforeUnload` calls `preventDefault` when dirty.

### Router migration (required)

`useBlocker` only works with a **data router**, but the app used the component
`BrowserRouter`. Migrated `App.tsx` to `createBrowserRouter` + `RouterProvider`
with a layout route (`AppLayout` = providers + NavBar + VerifyBanner +
ErrorBoundary + `<Outlet/>`); all routes/behavior preserved. Verified by the
existing `App.test` smoke test + build.

## 3. Remove-rating on dashboard album detail pages

Both detail pages get a `ConfirmButton` ("Remove this rating?") shown only for my
own rating; on confirm: `getMyRatingForAlbum(album.id)` → `deleteRating(id)` →
`navigate(profilePath(me))`.
- `AlbumDetailPage` (solo): shown when `username === me`.
- `FriendAlbumDetailPage` (comparison): shown when `pair.user_a_username === me`
  (user A is always the viewer).
- Also fixed a phase-42 leftover: `AlbumDetailPage`'s 403 message now says
  "friends only" instead of "private".

## 4. Drop the "Rated" button

`AlbumInfoPage`'s published branch no longer renders the disabled "Rated" button —
just the "Remove rating" control.

## Files touched

- `frontend/src/App.tsx` — data-router migration (`createBrowserRouter` + layout route).
- `frontend/src/pages/RatingEditorPage.tsx` (+ `.module.css`) — origin redirect on publish/remove; dirty-tracking; `useBlocker`/`useBeforeUnload`; unsaved-changes modal + styles.
- `frontend/src/pages/AlbumInfoPage.tsx` — `handleRate` passes `from`; removed the "Rated" button.
- `frontend/src/pages/ListenLaterPage.tsx` — Rate link passes `from: "/listen-later"`.
- `frontend/src/pages/AlbumDetailPage.tsx` / `FriendAlbumDetailPage.tsx` — Remove control (mine only) → profile; friends-only message fix.
- `frontend/src/test-setup.ts` — swallow the jsdom/undici "Expected signal … AbortSignal" rejection that a *completed* data-router navigation throws under jsdom (browser-only mismatch).
- Tests: `RatingEditorPage.test.tsx` (publish calls publishRating; unsaved modal blocks + Cancel stays; no block when clean), `AlbumDetailPage.test.tsx` (Remove shown for mine, hidden for others), `AlbumInfoPage.test.tsx` (no "Rated" button).

## Reused
`deleteRating`/`getMyRatingForAlbum` (`api/ratings`), `ConfirmButton`
(`components/ConfirmButton`), `profilePath` (`lib/paths`), `useAuth`,
`useBlocker`/`useBeforeUnload` (react-router-dom v7).

## Note on tests
The data-router migration means a *completed* in-jsdom navigation hits an
undici/jsdom `AbortSignal` mismatch (works fine in real browsers). Tests assert
what doesn't require a completed navigation (API calls, blocker modal, button
visibility); the redirect destinations are covered manually.

## Verification

- Frontend: `pnpm test` — 72 passed (+6); `pnpm tsc --noEmit` clean; `pnpm build` ok.
- Backend: `pytest` — 190 passed (untouched).
- Manual (user to confirm): publish → lands on origin (album page / Listen Later /
  album-page fallback); edit + leave → Save&quit/Quit/Cancel modal, tab-close →
  native warning; dashboard-detail Remove → my profile; no "Rated" button on a
  rated album page.
