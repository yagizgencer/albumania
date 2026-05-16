import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import styles from "./NavBar.module.css";

export function NavBar() {
  const { username, logout } = useAuth();

  if (!username) return null;

  return (
    <nav className={styles.nav}>
      <Link className={styles.link} to="/">Home</Link>
      <Link className={styles.link} to={`/profile/${username}`}>My Profile</Link>
      <Link className={styles.link} to="/listen-later">Listen Later</Link>
      <Link className={styles.link} to="/invites">Invites</Link>
      <Link className={styles.link} to="/friends">Friends</Link>
      <button className={styles.logout} onClick={logout}>Log out</button>
    </nav>
  );
}
