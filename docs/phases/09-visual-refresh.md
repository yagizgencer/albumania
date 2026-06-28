# Phase 09 — Visual refresh (cozy pastel sketch theme)

A UI polish pass to make the app consistent and "professional-playful": a cozy,
sketch-like, pastel look from colors through fonts to charts. No new framework —
the app already drove styling through CSS custom properties in `index.css`, so
this mostly re-skins those tokens and applies them consistently.

**Library decision:** added `roughjs` for hand-drawn SVG accents.
Alternatives considered: a full Tailwind/neobrutalism template (rejected — it
contradicts the project's "plain CSS modules, no Tailwind" decision and would be
a large rewrite) and `@recklyss/hand-drawn-ui` / Sketchbook UI (rejected — heavier
component dependencies; we only wanted a light decorative accent). Charts kept
Chart.js (just re-themed) rather than swapping to a sketchy chart lib, per
"the simplest thing that works".

## Files touched

- `frontend/index.html` — load Patrick Hand + Nunito from Google Fonts; cozy `theme-color`.
- `frontend/src/index.css` — new cozy pastel token system (paper surfaces, warm-ink text/borders, pastel "happy hues", radius/shadow tokens, readable `--accent`, status-pill tokens); display font for headings; sketch-style global button/input/link styling; faint dotted "paper" page texture.
- `frontend/src/main.tsx` — import the global Chart.js theme module.
- `frontend/src/lib/chartTheme.ts` — **new**: sets Chart.js defaults (Nunito font, ink text, faint grid) and exports the pastel `chartPalette` / `chartFill`.
- `frontend/src/components/SketchUnderline.tsx` — **new**: Rough.js hand-drawn underline that stretches to its parent and redraws on resize (decorative, `aria-hidden`).
- `frontend/src/test-setup.ts` — stub `ResizeObserver` (jsdom lacks it; used by SketchUnderline).
- `frontend/src/components/Avatar.module.css` — pastel lavender→pink gradient + ink border, ink text.
- `frontend/src/components/NavBar.module.css` — brand uses the hand-drawn display font; thin borders bumped to 2px ink.
- `frontend/src/pages/HomePage.tsx` — sketch underlines under the landing hero and the welcome heading.
- `frontend/src/pages/HomePage.module.css` — cozy cards (2px ink borders, soft offset shadows, lift hovers), display-font hero, underline wrappers; CTA buttons restyled.
- `frontend/src/pages/ProfileDashboardPage.tsx` — chart line uses the pastel palette.
- `frontend/src/pages/FriendDashboardPage.tsx` — chart series colors come from the pastel palette.
- `frontend/src/pages/{RatingEditorPage,ListenLaterPage,FriendsPage,AlbumSearchPage,AlbumInfoPage,ProfilePage,ProfileDashboardPage}.module.css` — hardcoded indigo/red/status hex colors replaced with tokens; thin borders bumped to 2px ink.
- `frontend/package.json` — added `roughjs`.

## Verification

- `pnpm test` — green (1 file, 1 test).
- `pnpm tsc --noEmit` — clean.
- `pnpm build` — succeeds.
- Manual browser check at `localhost:5173` still pending visual sign-off.
