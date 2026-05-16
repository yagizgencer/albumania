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

type SortColumn = "album" | "date" | "score" | "similarity";
type SortDirection = "asc" | "desc";
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
type Mode = "similarity" | "rating";

export function ProfileDashboardPage() {
  const { username } = useParams<{ username: string }>();
  if (!username) return null;
  return (
    <main className={styles.page}>
      <ProfileDashboard username={username} />
    </main>
  );
}

export function ProfileDashboard({ username }: { username: string }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DashboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortState | null>(null);
  const [artistFilter, setArtistFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cumulative, setCumulative] = useState(false);
  const [mode, setMode] = useState<Mode>("similarity");

  useEffect(() => {
    if (!username) return;
    setError(null);
    setEntries(null);
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
    if (sort === null) return arr;
    const dir = sort.direction === "asc" ? 1 : -1;
    const cmp = (a: DashboardEntry, b: DashboardEntry): number => {
      switch (sort.column) {
        case "album":
          return a.album.title.localeCompare(b.album.title) * dir;
        case "date":
          return a.completed_at.localeCompare(b.completed_at) * dir;
        case "score":
          return (a.score - b.score) * dir;
        case "similarity": {
          const av = a.similarity_user_vs_spotify ?? -Infinity;
          const bv = b.similarity_user_vs_spotify ?? -Infinity;
          return (av - bv) * dir;
        }
      }
    };
    arr.sort(cmp);
    return arr;
  }, [filtered, sort]);

  function cycleSort(column: SortColumn) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

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
        values.push(sum / (i + 1));
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

  if (error) return <p className="error">{error}</p>;
  if (!entries) return <p>Loading…</p>;

  return (
    <>
      <section className={styles.controls}>
        <div className={styles.toggleGroup}>
          <span className={styles.toggleLabel}>Metric</span>
          <div className={styles.segmented} role="group" aria-label="Metric">
            <button
              type="button"
              className={`${styles.seg} ${mode === "similarity" ? styles.segActive : ""}`}
              onClick={() => setMode("similarity")}
              aria-pressed={mode === "similarity"}
            >
              Similarity
            </button>
            <button
              type="button"
              className={`${styles.seg} ${mode === "rating" ? styles.segActive : ""}`}
              onClick={() => setMode("rating")}
              aria-pressed={mode === "rating"}
            >
              Rating
            </button>
          </div>
        </div>

        <div className={styles.toggleGroup}>
          <span className={styles.toggleLabel}>Trend</span>
          <div className={styles.segmented} role="group" aria-label="Trend">
            <button
              type="button"
              className={`${styles.seg} ${!cumulative ? styles.segActive : ""}`}
              onClick={() => setCumulative(false)}
              aria-pressed={!cumulative}
            >
              Flat
            </button>
            <button
              type="button"
              className={`${styles.seg} ${cumulative ? styles.segActive : ""}`}
              onClick={() => setCumulative(true)}
              aria-pressed={cumulative}
            >
              Running avg
            </button>
          </div>
        </div>

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
              <SortableHeader label="Album" column="album" sort={sort} onClick={cycleSort} align="left" />
              <SortableHeader label="Date" column="date" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Score" column="score" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Similarity" column="similarity" sort={sort} onClick={cycleSort} align="right" />
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
                  <div className={styles.albumCell}>
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
                    <span className={styles.albumText}>
                      <strong className={styles.albumTitle}>{e.album.title}</strong>
                      <small className={styles.albumArtist}>{e.album.artist}</small>
                    </span>
                  </div>
                </td>
                <td className={styles.numCell}>{e.completed_at.slice(0, 10)}</td>
                <td className={styles.numCell}>{e.score.toFixed(1)}</td>
                <td className={styles.numCell}>
                  {e.similarity_user_vs_spotify === null
                    ? "—"
                    : e.similarity_user_vs_spotify.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SortableHeader — click to cycle asc → desc → none for this column
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  column,
  sort,
  onClick,
  align,
}: {
  label: string;
  column: SortColumn;
  sort: SortState | null;
  onClick: (column: SortColumn) => void;
  align: "left" | "right";
}) {
  const active = sort?.column === column;
  const indicator = !active ? "↕" : sort.direction === "asc" ? "▲" : "▼";
  const ariaSort = !active
    ? "none"
    : sort.direction === "asc"
    ? "ascending"
    : "descending";
  return (
    <th
      className={`${styles.th} ${align === "right" ? styles.thRight : ""}`}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ""}`}
        onClick={() => onClick(column)}
      >
        <span>{label}</span>
        <span className={styles.sortIcon} aria-hidden>{indicator}</span>
      </button>
    </th>
  );
}
