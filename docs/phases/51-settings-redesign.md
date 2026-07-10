# Phase 51 — Settings page redesign + shared password/icon polish

Visual redesign of the Settings page (`/settings`) and its four tabs (Account,
Appearance, Security, Privacy) onto the Warm Peach sticker-card system, plus two
site-wide icon fixes that reach every page.

## What changed

- **Standardized page shell** — dropped `PageContainer` for a `<main className={page}>`
  with the shared margins (`min(93vw, 1080px)`, `margin: 2rem auto`, `page-pad` sides) and
  a display-font page title. Panels are now proper sticker cards (`radius-lg` + offset
  shadow, dark bevel override) instead of the flat boxes.
- **Readable email status badge** — the old dark-green "✓ Verified" text was invisible in
  dark mode. Replaced with a pill badge (shield-check icon + label): **Verified** in a teal
  "you're set" tone and **Not verified** in an amber "needs attention" tone — same shape,
  both readable in light + dark. The resend-verification `Alert` still shows when unverified.
- **Appearance theme picker** — replaced the blocky segmented `Tabs` with three icon choice
  cards (**System** = monitor, **Light** = sun, **Dark** = moon), active card filled teal,
  as a proper `radiogroup`. The device-follow / "Always light|dark" hint sits below.
- **Password show/hide icons** — the 👁 / 🙈 emojis (used on login, register, reset, and the
  Security tab) are replaced with clean line-drawn eye / eye-with-slash icons that match the
  rest of the icon set; the toggle is a quiet inline button (no global button chrome).

### Follow-up polish

- **Page margins now match the other pages** — `.page` uses `max-width: var(--page-max)`
  + `padding: 0 var(--page-pad)` (same as the Artist page), instead of the narrower cap.
- **Section rail is no longer a solid green box** — the active tab uses a faint teal wash,
  a teal accent bar down the left edge, and teal-tinted (but always readable) text, rather
  than a filled teal block.
- **Navbar profile dropdown polished** — added the user's avatar to the menu header (avatar +
  name/handle), a warm inner-hairline contour in dark mode so it reads against the dark
  navbar, larger min-width, and a slightly larger display-font name. "Log out" keeps the
  readable danger tone in both themes.

## Files touched

- `frontend/src/components/Icons.tsx` — added `EyeIcon`, `EyeOffIcon`, `SunIcon`, `MoonIcon`,
  `MonitorIcon`, `ShieldCheckIcon`.
- `frontend/src/components/PasswordInput.tsx` — swap the emoji toggle for the eye icons.
- `frontend/src/components/PasswordInput.module.css` — icon-button toggle (reset chrome,
  hover tint, focus ring); this styling flows to every password field on the site.
- `frontend/src/pages/SettingsPage.tsx` — `<main>` shell, verified/not-verified badge,
  icon theme-choice cards; dropped `PageContainer`/`Tabs` imports.
- `frontend/src/pages/SettingsPage.module.css` — page shell (page-max margins), sticker-card
  panels (dark override), badge tones, theme cards, and the rail's accent-bar active state.
- `frontend/src/components/NavBar.tsx` — avatar in the profile-menu header.
- `frontend/src/components/NavBar.module.css` — dropdown contour (dark hairline), header
  avatar layout, name/handle typography.

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files); SettingsPage tests unchanged and green.
- `pnpm build` — clean.

## Notes

- No new libraries. The password-icon change is intentionally shared: it updates Login,
  Register, Reset password, and the Security tab in one place.
- Direction taken directly from the user's brief (icons: monitor/sun/moon for themes;
  professional verified badge; cozy line-icon password toggle) — no throwaway mockup needed
  since it's applying the established design system.
