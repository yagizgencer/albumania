// Simple inline SVG icons. Inherit currentColor; size controlled via the
// `size` prop. Kept lightweight so we don't pull in an icon library.

interface IconProps {
  size?: number;
  className?: string;
}

export function HomeIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 3.172 2.5 11.586V21h7v-6h5v6h7v-9.414L12 3.172z" />
    </svg>
  );
}

export function PeopleIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm9 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1 20c.5-4 4-6 7-6s6.5 2 7 6H1zm14-5c2.5.2 5 1.6 5.5 5H16c-.1-1.8-.6-3.5-1-5z" />
    </svg>
  );
}

export function HeadphonesIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 3a9 9 0 0 0-9 9v6a2 2 0 0 0 2 2h3v-8H5v-0a7 7 0 1 1 14 0v0h-3v8h3a2 2 0 0 0 2-2v-6a9 9 0 0 0-9-9z" />
    </svg>
  );
}

export function BellIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zM19 17l-1.6-1.6V11a5.5 5.5 0 0 0-4.4-5.4V5a1 1 0 0 0-2 0v.6A5.5 5.5 0 0 0 6.6 11v4.4L5 17v1h14v-1z" />
    </svg>
  );
}
