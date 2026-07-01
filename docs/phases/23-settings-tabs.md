# Phase 23 — Settings tabs (Account / Security / Privacy)

Reorganizes Settings into a tabbed, modular shell so options are sectioned and
extensible, and moves the profile-visibility control out of the profile edit form
into a dedicated Privacy tab.

## Frontend

- **`src/pages/SettingsPage.tsx`** — rewritten as a tabbed page. Active tab syncs to
  `?tab=` via `useSearchParams` (`account` is the default and clears the param).
  Split into `AccountTab` (email + verification), `SecurityTab` (change-password
  form — now **only** reachable under its tab, not shown up front), and
  `PrivacyTab` (profile visibility → `updateMe({ profile_visibility })` +
  `refreshProfile`). Guards on `profile` with a loading state.
- **`src/pages/SettingsPage.module.css`** — `.tabs` / `.tab` / `.tabActive` tab bar,
  `.panel`, `.backLink`; widened the page a touch.
- **`src/pages/ProfilePage.tsx`** — removed the visibility `<select>` (and its state
  + the `profile_visibility` field from the `updateMe` call) from `ProfileEditor`;
  it now shows a hint linking to **Settings › Privacy**. Dropped the now-unused
  `ProfileVisibility` import; added `Link`.
- **`src/pages/ProfilePage.module.css`** — `.editorHint` style.

## Tests

- **`src/pages/SettingsPage.test.tsx`** *(new)* — defaults to Account with the
  password form hidden; the password form appears only under Security; the Privacy
  tab saves visibility via `updateMe` + `refreshProfile`.

## Verification

- `cd frontend && pnpm test` → **31 passed**; `pnpm tsc --noEmit` clean;
  `pnpm build` succeeds (pre-existing >500 kB chunk-size warning).
- Backend unchanged.
- Manual at `localhost:5173`: Settings shows Account / Security / Privacy tabs;
  `?tab=` deep-links; change-password lives under Security; profile visibility is
  edited under Privacy and no longer appears in the profile edit form.

## Notes

- No new libraries. This completes the approved comments + rearrange + settings plan
  (phases 20–23).
