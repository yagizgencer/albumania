import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { HeadphonesIcon, HomeIcon, PeopleIcon } from "./Icons";
import styles from "./NavBar.module.css";

export function NavBar() {
  const { username, logout, profile } = useAuth();
  const { summary, markSeen } = useNotifications();

  if (!username) return null;

  return (
    <nav className={styles.nav}>
      <NavLink to="/" className={styles.brand}>
        Albumania
      </NavLink>

      <div className={styles.itemsRow}>
        <NavItem to="/" label="Home">
          <HomeIcon size={26} />
        </NavItem>

        <NavItem to={`/profile/${username}`} label="Me">
          <Avatar
            username={username}
            pictureUrl={profile?.profile_picture_url ?? null}
            displayName={profile?.display_name ?? username}
            size={26}
            className={styles.avatarWrap}
          />
        </NavItem>

        <NavItem
          to="/listen-later"
          label="Listen Later"
          badge={summary.listen_invites}
          onActivate={() => {
            if (summary.listen_invites > 0) void markSeen("listen_invites");
          }}
        >
          <HeadphonesIcon size={26} />
        </NavItem>

        <NavItem
          to="/friends"
          label="Friends"
          badge={summary.friend_requests}
          onActivate={() => {
            if (summary.friend_requests > 0) void markSeen("friend_requests");
          }}
        >
          <PeopleIcon size={26} />
        </NavItem>
      </div>

      <div className={styles.right}>
        <NotificationBell />
        <button className={styles.logout} onClick={logout}>
          Log out
        </button>
      </div>
    </nav>
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
    >
      <span className={styles.itemIcon}>
        {children}
        {badge && badge > 0 ? (
          <span className={styles.badge}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </span>
      <span className={styles.itemLabel}>{label}</span>
    </NavLink>
  );
}
