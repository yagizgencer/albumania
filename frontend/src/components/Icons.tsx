// Simple inline SVG icons. Inherit currentColor; size controlled via the
// `size` prop. Kept lightweight so we don't pull in an icon library.

interface IconProps {
  size?: number;
  className?: string;
}

// Nav icons use a hand-drawn outline style (rounded stroke, no fill) to match
// the sketchbook logo. `strokeWidth` scales down as the icon grows so big icons
// don't look heavy.
function sketchStroke(size: number): number {
  return size >= 28 ? 1.9 : 2.1;
}

export function HomeIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.5 11.3 12 4.2l8.5 7.1" />
      <path d="M5.3 10v8.4c0 .5.4.9.9.9h11.6c.5 0 .9-.4.9-.9V10" />
      <path d="M9.7 19.3v-4.2c0-.6.5-1.1 1.1-1.1h2.4c.6 0 1.1.5 1.1 1.1v4.2" />
    </svg>
  );
}

export function SettingsIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.27 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94 0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.66.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.52.02.66-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
    </svg>
  );
}

export function SearchIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

export function PeopleIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M16 5.4a2.9 2.9 0 0 1 .3 5.7" />
      <path d="M17 14.2c2.3.4 3.8 2.3 3.8 5.3" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <path d="M4.5 14.5c0-.8.6-1.4 1.4-1.4h.7c.5 0 .9.4.9.9v4c0 .5-.4.9-.9.9h-.7c-.8 0-1.4-.6-1.4-1.4z" />
      <path d="M19.5 14.5c0-.8-.6-1.4-1.4-1.4h-.7c-.5 0-.9.4-.9.9v4c0 .5.4.9.9.9h.7c.8 0 1.4-.6 1.4-1.4z" />
    </svg>
  );
}

export function BellIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6.3 16.5c-.5 0-.8-.6-.5-1l1-1.4V11a5.2 5.2 0 0 1 10.4 0v3.1l1 1.4c.3.4 0 1-.5 1z" />
      <path d="M10 19.3a2.2 2.2 0 0 0 4 0" />
      <path d="M12 5.8V4.3" />
    </svg>
  );
}

export function CheckIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12.5 10 17.5 19 6.5" />
    </svg>
  );
}

export function PlusIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ThumbUpIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M2 10h4v11H2V10zm6 0 5-8c1.2 0 2 1 1.8 2.2L14 8h6a2 2 0 0 1 2 2.3l-1.3 8A2.5 2.5 0 0 1 18.2 21H8V10z" />
    </svg>
  );
}

export function ThumbDownIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M22 14h-4V3h4v11zm-6 0-5 8c-1.2 0-2-1-1.8-2.2L10 16H4a2 2 0 0 1-2-2.3l1.3-8A2.5 2.5 0 0 1 5.8 3H16v11z" />
    </svg>
  );
}

export function UserIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6z" />
    </svg>
  );
}

export function StarIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.05 1.1-6.47L2.6 9.9l6.5-.95L12 2.5z" />
    </svg>
  );
}

export function CommentIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

// -- Sketchbook empty-state icons (hand-drawn line style, match nav icons) ----

/** Two friends side by side — used for the empty friends list. Cozier than the
 *  🫂 emoji, and matches the nav People icon's hand-drawn style. */
export function FriendsHeartIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="8" cy="10" r="2.6" />
      <path d="M3.5 19.5c0-2.9 2-4.8 4.5-4.8s4.5 1.9 4.5 4.8" />
      <circle cx="16.5" cy="7.5" r="2.4" />
      <path d="M13.5 15.2c.9-.5 1.9-.7 3-.7 2.3 0 4 1.8 4 4.5" />
    </svg>
  );
}

/** Open envelope / inbox — used for the empty incoming-requests list. */
export function InboxIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M4 6.5 12 12l8-5.5" />
    </svg>
  );
}

/** Paper plane — used for the empty outgoing-requests list. */
export function PaperPlaneIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sketchStroke(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20.5 3.5 3.5 10.5l6.5 2.5 2.5 6.5z" />
      <path d="M20.5 3.5 10 13" />
    </svg>
  );
}

/** Spotify glyph — solid circle with the three curved bars. Used inline next to
 *  the "Spotify" comparison option. Uses fill (not the sketch stroke) so the
 *  brand mark stays recognisable. */
export function SpotifyIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.16a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.55 11.5 1.35.36.22.47.68.24 1.02zm1.2-2.7a.94.94 0 0 1-1.29.31c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 0 1-.54-1.8c4.3-1.3 9.7-.68 13.4 1.6.44.27.58.85.31 1.29zm.1-2.8C14.2 8.6 7.9 8.4 4.2 9.5a1.12 1.12 0 1 1-.65-2.15c4.3-1.3 11.2-1.05 15.4 1.45a1.12 1.12 0 1 1-1.15 1.92z" />
    </svg>
  );
}
