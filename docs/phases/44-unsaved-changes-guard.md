# Phase 44 — Unsaved-changes guard for comments & bio (unified)

## Context

Phase 43 guarded the rating editor. The user wants the same protection for
**comments** and the **profile bio**, and — per follow-up — a **three-button**
prompt where **"Save & quit" saves ALL dirty editors on the page** (e.g. two edited
comments + one new one all posted together), with the rating editor **unified** onto
the same system.

Confirmed: buttons are **Save & quit / Quit without saving / Cancel**; "Save" saves
every dirty editor on the page.

## Approach: a shared unsaved-changes registry

New `lib/unsavedChanges.tsx`:
- `UnsavedChangesProvider` — holds a `Map<id, { dirty, save }>` and a dirty count.
- `useRegisterUnsaved(id, dirty, save)` — any editor registers a stable id (from
  `useId`), its current dirtiness, and how to save itself; cleaned up on unmount.
- `useUnsavedNavigationGuard()` — `useBlocker` (in-app nav) + `useBeforeUnload`
  (tab-close/refresh) while anything is dirty; returns `{ blocker, saveAll }`.
- `saveAll()` runs every currently-dirty editor's save in parallel.
- Missing-provider is a no-op registry (isolated component tests don't crash).

New `components/UnsavedChangesModal.tsx` (+ CSS): the shared 3-button modal.
**Save & quit** calls `saveAll()` then `blocker.proceed()`; **Quit without saving**
`blocker.proceed()`; **Cancel** `blocker.reset()`.

`UnsavedChangesProvider` is mounted once in `AppLayout` (App.tsx), inside the data
router (needed for `useBlocker`, in place since phase 43).

## Wiring

- **Comments** (`components/CommentComposer.tsx`): "action" composers (add/edit a
  comment) register themselves — dirty when their text differs from `initialText`;
  their "save" is `handleSubmit` (posts the comment). Controlled "field" composers
  (bio, rating publish box) don't self-register (their parent owns the value).
  `AlbumInfoPage` renders the guard + modal, so any add/edit draft is protected.
- **Bio** (`pages/ProfilePage.tsx` `ProfileEditor`): registers dirty when display
  name/description differ from the profile; "save" persists via `updateMe`.
  `ProfilePage` renders the guard + modal.
- **Rating editor** (`pages/RatingEditorPage.tsx`): migrated off its phase-43
  bespoke blocker onto the shared registry/modal; a queued `pendingNav` effect
  performs the publish/remove redirect after the dirty flag clears (so our own
  navigation isn't blocked). Removed the now-unused local modal + CSS.

## Files touched

- `frontend/src/lib/unsavedChanges.tsx` (new) — registry + hooks + guard.
- `frontend/src/components/UnsavedChangesModal.tsx` / `.module.css` (new) — shared modal.
- `frontend/src/App.tsx` — mount `UnsavedChangesProvider` in `AppLayout`.
- `frontend/src/components/CommentComposer.tsx` — register action-mode drafts.
- `frontend/src/pages/AlbumInfoPage.tsx` — guard + modal.
- `frontend/src/pages/ProfilePage.tsx` — bio editor registers; guard + modal.
- `frontend/src/pages/RatingEditorPage.tsx` (+ `.module.css`) — use the shared guard/modal; queued redirect.
- Tests: new `lib/unsavedChanges.test.tsx` (block/cancel, no-block when clean,
  Save & quit saves ALL dirty editors); `RatingEditorPage.test.tsx` updated to the
  shared provider; `AlbumInfoPage.test.tsx` / `ProfilePage.test.tsx` switched to a
  data router (createMemoryRouter) + provider, with friend-pick navigation asserted
  via a `useNavigate` spy (jsdom can't complete a data-router navigation).

## Verification

- Frontend: `pnpm test` — 75 passed (+9); `pnpm tsc --noEmit` clean; `pnpm build` ok.
- Backend: `pytest` — 190 passed (untouched).
- Manual at `localhost:5173`:
  1. Album page: type a comment and/or edit an existing one → click a nav link →
     "Unsaved changes" modal (Save & quit / Quit without saving / Cancel). Save &
     quit posts every dirty draft then leaves; tab-close → native warning.
  2. Profile: edit the bio → try to leave → same modal; Save & quit persists it.
  3. Rating editor still prompts on leave; publish/remove redirect unaffected.

## Note on tests
The data-router migration (phase 43) means jsdom can't *complete* an in-app
navigation (undici/AbortSignal mismatch — real browsers are fine). Tests assert the
guard modal's presence/absence, `saveAll` behavior, and navigation *intent* (via a
`useNavigate` spy) rather than the landed route.
