import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useNavigate, useParams } from "react-router-dom";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import styles from "./ProfileDashboardPage.module.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

type SortKey = "date" | "score" | "similarity";
type Mode = "similarity" | "rating";

export function ProfileDashboardPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<DashboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [artistFilter, setArtistFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cumulative, setCumulative] = useState(false);
  const [mode, setMode] = useState<Mode>("similarity");

  useEffect(() => {
    if (!username) return;
    setError(null);
    getDashboard(username)
      .then((data) => setEntries(data.entries))
      .catch((err) => {
        if (err?.response?.status === 403) {
          setError("This profile is private.");
        } else if (err?.response?.status === 404) {
          setError("User not found.");
        } else {
          setError("Could not load dashboard.");
        }
      });
  }, [username]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      if (
        artistFilter &&
        !e.album.artist.toLowerCase().includes(artistFilter.toLowerCase()) &&
        !e.album.title.toLowerCase().includes(artistFilter.toLowerCase())
      ) {
        return false;
      }
      const d = e.completed_at.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [entries, artistFilter, fromDate, toDate]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "date") {
      arr.sort((a, b) => a.completed_at.localeCompare(b.completed_at));
    } else if (sortKey === "score") {
      arr.sort((a, b) => b.score - a.score);
    } else {
      arr.sort(
        (a, b) =>
          (b.similarity_user_vs_spotify ?? -Infinity) -
          (a.similarity_user_vs_spotify ?? -Infinity)
      );
    }
    return arr;
  }, [filtered, sortKey]);

  // Chart: always plot vs date (asc) — independent of table sort
  const chartData = useMemo(() => {
    const byDate = [...filtered].sort((a, b) =>
      a.completed_at.localeCompare(b.completed_at)
    );

    const rawValues = byDate.map((e) =>
      mode === "rating" ? e.score : e.similarity_user_vs_spotify ?? 0
    );

    const values: number[] = [];
    if (cumulative) {
      let sum = 0;
      rawValues.forEach((v, i) => {
        sum += v;
        values.push(sum / (i + 1)); // running average
      });
    } else {
      values.push(...rawValues);
    }

    return {
      labels: byDate.map((e) => e.completed_at.slice(0, 10)),
      datasets: [
        {
          label:
            (mode === "rating" ? "Score" : "Similarity vs Spotify") +
            (cumulative ? " (running avg)" : ""),
          data: values,
          borderColor: "#4caf50",
          backgroundColor: "rgba(76, 175, 80, 0.15)",
          tension: 0.25,
        },
      ],
    };
  }, [filtered, mode, cumulative]);

  if (error) return <main className={styles.page}><p className="error">{error}</p></main>;
  if (!entries) return <main className={styles.page}><p>Loading…</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{username}'s dashboard</h1>
        <p>Compared to Spotify's most-popular tracks.</p>
      </header>

      <section className={styles.controls}>
        <label>
          Sort by
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="date">Date</option>
            <option value="score">Score</option>
            <option value="similarity">Similarity</option>
          </select>
        </label>

        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="similarity">Similarity</option>
            <option value="rating">Rating</option>
          </select>
        </label>

        <label>
          Artist / album
          <input
            type="text"
            placeholder="Filter…"
            value={artistFilter}
            onChange={(e) => setArtistFilter(e.target.value)}
          />
        </label>

        <label>
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>

        <label>
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>

        <label style={{ flexDirection: "row", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={cumulative}
            onChange={(e) => setCumulative(e.target.checked)}
          />
          Cumulative (running avg)
        </label>
      </section>

      <section className={styles.chartCard}>
        {filtered.length === 0 ? (
          <p className={styles.empty}>No ratings match the current filters.</p>
        ) : (
          <Line
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { position: "top" as const } },
              scales: { y: { beginAtZero: mode === "rating" } },
            }}
          />
        )}
      </section>

      {sorted.length === 0 ? (
        <p className={styles.empty}>No published ratings yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Album</th>
              <th>Date</th>
              <th>Score</th>
              <th>Similarity</th>
              <th>Tracks</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr
                key={e.album.id}
                className={styles.row}
                onClick={() => navigate(`/users/${username}/albums/${e.album.spotify_id}`)}
              >
                <td>
                  {e.album.album_art_url && (
                    <img
                      src={e.album.album_art_url}
                      alt=""
                      className={styles.albumArt}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        navigate(`/albums/${e.album.spotify_id}`);
                      }}
                    />
                  )}
                  <strong>{e.album.title}</strong>
                  <br />
                  <small>{e.album.artist}</small>
                </td>
                <td>{e.completed_at.slice(0, 10)}</td>
                <td>{e.score.toFixed(1)}</td>
                <td>
                  {e.similarity_user_vs_spotify === null
                    ? "—"
                    : e.similarity_user_vs_spotify.toFixed(2)}
                </td>
                <td>{e.album.total_songs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
