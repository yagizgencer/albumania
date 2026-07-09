import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { TopSearch } from "./TopSearch";
import {
  HeadphonesIcon,
  HomeIcon,
  LogoutIcon,
  PeopleIcon,
  SettingsIcon,
  UserIcon,
} from "./Icons";
import { profilePath } from "../lib/paths";
import styles from "./NavBar.module.css";

export function NavBar() {
  const { username, logout, profile } = useAuth();
  const { summary, markSeen } = useNotifications();

  if (!username) return null;

  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.brand}>
        <img
          src="/albumania_icon.png"
          alt=""
          className={styles.brandLogo}
          aria-hidden
        />
        <span className={styles.brandText}>Albumania</span>
      </NavLink>

      <div className={styles.center}>
        <NavItem to="/" label="Home">
          <HomeIcon size={33} />
        </NavItem>

        <TopSearch />

        <NavItem
          to="/listen-later"
          label="Listen & Rate"
          badge={summary.listen_invites}
          onActivate={() => {
            if (summary.listen_invites > 0) void markSeen("listen_invites");
          }}
        >
          <HeadphonesIcon size={33} />
        </NavItem>
      </div>

      <div className={styles.right}>
        <NotificationBell />

        <NavItem
          to="/friends"
          label="Friends"
          badge={summary.friend_requests}
          onActivate={() => {
            if (summary.friend_requests > 0) void markSeen("friend_requests");
          }}
        >
          <PeopleIcon size={33} />
        </NavItem>

        <ProfileMenu
          username={username}
          pictureUrl={profile?.profile_picture_url ?? null}
          displayName={profile?.display_name ?? username}
          onLogout={logout}
        />
      </div>
    </nav>
  );
}

function ProfileMenu({
  username,
  pictureUrl,
  displayName,
  onLogout,
}: {
  username: string;
  pictureUrl: string | null;
  displayName: string;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <div className={styles.profileWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.profileBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar
          username={username}
          pictureUrl={pictureUrl}
          displayName={displayName}
          size={32}
        />
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            <span className={styles.menuName}>{displayName}</span>
            <span className={styles.menuHandle}>@{username}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => go(profilePath(username))}
          >
            <UserIcon size={17} className={styles.menuIcon} />
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => go("/settings")}
          >
            <SettingsIcon size={17} className={styles.menuIcon} />
            Settings
          </button>
          <div className={styles.menuDivider} role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            <LogoutIcon size={17} className={styles.menuIcon} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  label,
  badge,
  children,
  onActivate,
}: {
  to: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
  onActivate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `${styles.item} ${isActive ? styles.itemActive : ""}`
      }
      onClick={onActivate}
      // Icons only now; the custom hover chip (`data-tip`) replaces the browser's
      // native `title`; `aria-label` keeps the accessible name.
      data-tip={label}
      aria-label={label}
    >
      <span className={styles.itemIcon}>
        {children}
        {badge && badge > 0 ? (
          <span className={styles.badge}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </span>
    </NavLink>
  );
}
