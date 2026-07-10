# Phase 48 — Listen & Rate redesign (card gallery + trending-style invites)

Visual redesign of the Listen & Rate page (`/listen-later`), chosen from an
interactive design exploration ("Option B"). Old page: a text-button list with a
narrow 280px sidebar. New page: a card gallery with a Home-trending-style invites
rail, standardized widths, and icon actions.

## What changed

- **Page width / margins** now match Home/Album: `max-width: min(93vw, 1560px)`,
  `padding: 0 0.35rem`. Layout is a `340px | 1fr` grid (invites rail | queue).
- **Invites rail = trending boxes.** Incoming / Outgoing invites render in
  Home-`TrendingBox`-style sticker cards (display-font header + accent underline +
  a teal count pill, compact rows with a 44px cover, album/artist links, and a
  "from @user" line). Sticky on desktop.
- **Queue = card gallery.** Each album is a card (`repeat(auto-fill, minmax(230px,
  1fr))`): cover (links to album), display-font **title link**, **artist link**, a
  **disc-icon release-date chip** (full `formatDate`), the listening-with control,
  and icon actions pinned to the card bottom.
- **Icon actions with tooltips** (album-page `.iconBtn` style): **★ Rate** (gold,
  a `Link` to the editor) and **🗑 Remove** (clay red, opens the inline "Remove
  from Listen Later?" confirm). Invite actions are compact **✓ Accept / ✕ Decline
  / ✕ Cancel** icon buttons (`iconBtnSm`, 30px — a touch smaller).
- **"Listening with" picker.** Reuses the Album page's search+dropdown pattern
  (search icon · input · teal count badge · chevron → a listbox of participants).
  Each row shows the avatar, a **profile link**, the **invite direction** ("You
  invited" / "Invited you"), and a **status pill** — teal **Published** or amber
  **Rating…** — instead of a score. The control is **hidden when you're listening
  solo** (no accepted participants).
- No Spotify pop-out here (per request). Removed the old inline text buttons,
  participant chips, and `.sidebar*`/`.row`/`.action`/`.chip*` styles.

## Files touched

- `frontend/src/pages/ListenLaterPage.tsx` — rewritten: `InviteBox`,
  restyled `SidebarInvite` (trending row + icon accept/decline/cancel),
  `EntryCard` (cover/title/artist/date/actions + confirm), and the new
  `ListeningWithPicker`. New icon imports (`StarIcon`, `TrashIcon`, `CheckIcon`,
  `CloseIcon`, `DiscIcon`, `SearchIcon`, `ChevronDownIcon`, `PeopleIcon`),
  `formatDate`.
- `frontend/src/pages/ListenLaterPage.module.css` — rewritten to the card gallery
  + trending-box + icon-button + searchbar/dropdown styles (searchbar/dropdown
  copied from `AlbumInfoPage.module.css`, score pill → status pill), with dark
  overrides.
- `frontend/src/pages/ListenLaterPage.test.tsx` — the participant-link test now
  opens the "Listening with" dropdown (participants moved into it) before asserting
  the profile link.

## Follow-up tweaks

- **Card body reflowed:** the artist now sits on its **own line** (body-font 700
  subtitle, matching the Album/Rating pages — not the title's display font), with a
  quiet **disc-icon + release-date line beneath it** (plain, no chip).
- **Listening-with control** moved to the card's **bottom-right corner** and changed
  from a searchbar to a compact **avatar stack** (up to 2 photos + "+N"). Clicking it
  opens the same scrollable status dropdown (direction + Published/Rating), now
  opening **upward**, with **no search input**. Footer = actions left, stack right.

- **Listening-with = "soft chip".** A subtle pill: a teal **headphones** glyph +
  the stacked photos. Each **avatar is its own profile link** (hover lifts it toward
  the accent). Clicking **anywhere else** on the chip (headphones, "+N", padding)
  **highlights** it and opens the scrollable status dropdown. Chip highlight uses
  `:hover:not(:has(.lwAvatarLink:hover))` so hovering an avatar doesn't also light
  the chip. Photos carry a thin outline — dark ink in light, warm light hairline in
  dark. Icons used: `HeadphonesIcon`, `HourglassIcon`.

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm test` — 76 passed (20 files); the 4 ListenLater tests updated/green.
- `pnpm build` — clean.

## Notes

- No new libraries. Reuses existing `Avatar`, icons, `formatDate`, and the album
  searchbar styling.
- Direction chosen via a throwaway HTML mockup under `design-explorations/`
  (choosing, not verifying — implementation verified with tsc/test/build).
