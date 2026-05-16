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
import {
  getFriendDashboard,
  type FriendDashboardEntry,
  type FriendDashboardResponse,
} from "../api/friendDashboard";
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

type SortKey =
  | "date"
  | "release-date"
  | "mean"
  | "a-score"
  | "b-score"
  | "pair-similarity"
  | "a-similarity"
  | "b-similarity";

type Mode = "similarity" | "ratings";

const A_COLOR = "#4caf50";
const B_COLOR = "#e91e63";
const PAIR_COLOR = "#3e95cd";
const MEAN_COLOR = "#555";

export function FriendDashboardPage() {
  const { friendshipId } = useParams<{ friendshipId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<FriendDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [artistFilter, setArtistFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cumulative, setCumulative] = useState(false);
  const [mode, setMode] = useState<Mode>("similarity");

  useEffect(() => {
    if (!friendshipId) return;
    const id = Number(friendshipId);
    if (!Number.isFinite(id)) return;
    setError(null);
    getFriendDashboard(id)
      .then(setData)
      .catch((err) => {
        if (err?.response?.status === 403) {
          setError("You don't have access to this friend dashboard.");
        } else if (err?.response?.status === 404) {
          setError("Friendship not found.");
        } else {
          setError("Could not load dashboard.");
        }
      });
  }, [friendshipId]);

  const entries: FriendDashboardEntry[] = data?.entries ?? [];

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = artistFilter.toLowerCase();
      if (
        q &&
        !e.album.artist.toLowerCase().includes(q) &&
        !e.album.title.toLowerCase().includes(q)
      ) {
        return false;
      }
      const d = e.mutual_date.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [entries, artistFilter, fromDate, toDate]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const sims = (e: FriendDashboardEntry, key: "similarity_users" | "similarity_a_vs_spotify" | "similarity_b_vs_spotify") =>
      e[key] ?? -Infinity;
    switch (sortKey) {
      case "date":
        arr.sort((a, b) => a.mutual_date.localeCompare(b.mutual_date));
        break;
      case "release-date":
        arr.sort((a, b) => a.album.release_date.localeCompare(b.album.release_date));
        break;
      case "mean":
        arr.sort((a, b) => b.mean_score - a.mean_score);
        break;
      case "a-score":
        arr.sort((a, b) => b.user_a_score - a.user_a_score);
        break;
      case "b-score":
        arr.sort((a, b) => b.user_b_score - a.user_b_score);
        break;
      case "pair-similarity":
        arr.sort((a, b) => sims(b, "similarity_users") - sims(a, "similarity_users"));
        break;
      case "a-similarity":
        arr.sort((a, b) => sims(b, "similarity_a_vs_spotify") - sims(a, "similarity_a_vs_spotify"));
        break;
      case "b-similarity":
        arr.sort((a, b) => sims(b, "similarity_b_vs_spotify") - sims(a, "similarity_b_vs_spotify"));
        break;
    }
    return arr;
  }, [filtered, sortKey]);

  const chartData = useMemo(() => {
    const byDate = [...filtered].sort((a, b) =>
      a.mutual_date.localeCompare(b.mutual_date)
    );
    const labels = byDate.map((e) => e.mutual_date.slice(0, 10));

    const series = (values: (number | null)[]) => {
      const clean = values.map((v) => v ?? 0);
      if (!cumulative) return clean;
      let sum = 0;
      return clean.map((v, i) => (sum += v) / (i + 1));
    };

    const aLabel = data?.user_a_username ?? "User A";
    const bLabel = data?.user_b_username ?? "User B";

    const datasets =
      mode === "similarity"
        ? [
            {
              label: `${aLabel} ↔ ${bLabel}`,
              data: series(byDate.map((e) => e.similarity_users)),
              borderColor: PAIR_COLOR,
              backgroundColor: PAIR_COLOR,
              tension: 0.25,
            },
            {
              label: `${aLabel} ↔ Spotify`,
              data: series(byDate.map((e) => e.similarity_a_vs_spotify)),
              borderColor: A_COLOR,
              backgroundColor: A_COLOR,
              tension: 0.25,
            },
            {
              label: `${bLabel} ↔ Spotify`,
              data: series(byDate.map((e) => e.similarity_b_vs_spotify)),
              borderColor: B_COLOR,
              backgroundColor: B_COLOR,
              tension: 0.25,
            },
          ]
        : [
            {
              label: `${aLabel} score`,
              data: series(byDate.map((e) => e.user_a_score)),
              borderColor: A_COLOR,
              backgroundColor: A_COLOR,
              tension: 0.25,
            },
            {
              label: `${bLabel} score`,
              data: series(byDate.map((e) => e.user_b_score)),
              borderColor: B_COLOR,
              backgroundColor: B_COLOR,
              tension: 0.25,
            },
            {
              label: "Mean",
              data: series(byDate.map((e) => e.mean_score)),
              borderColor: MEAN_COLOR,
              backgroundColor: MEAN_COLOR,
              tension: 0.25,
            },
          ];

    return { labels, datasets };
  }, [filtered, mode, cumulative, data]);

  if (error) return <main className={styles.page}><p className="error">{error}</p></main>;
  if (!data) return <main className={styles.page}><p>Loading…</p></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>
          {data.user_a_username} ↔ {data.user_b_username}
        </h1>
        <p>Albums you've both published a rating for.</p>
      </header>

      <section className={styles.controls}>
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="similarity">Similarity</option>
            <option value="ratings">Ratings</option>
          </select>
        </label>

        <label>
          Sort by
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="date">Rating date</option>
            <option value="release-date">Release date</option>
            <option value="mean">Mean score</option>
            <option value="a-score">{data.user_a_username} score</option>
            <option value="b-score">{data.user_b_username} score</option>
            <option value="pair-similarity">{data.user_a_username} ↔ {data.user_b_username}</option>
            <option value="a-similarity">{data.user_a_username} ↔ Spotify</option>
            <option value="b-similarity">{data.user_b_username} ↔ Spotify</option>
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
          <p className={styles.empty}>No mutual ratings match the current filters.</p>
        ) : (
          <Line
            data={chartData}
            options={{
              responsive: true,
              plugins: { legend: { position: "top" as const } },
              scales: { y: { beginAtZero: mode === "ratings" } },
            }}
          />
        )}
      </section>

      {sorted.length === 0 ? (
        <p className={styles.empty}>No mutual ratings yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Album</th>
              <th>Release</th>
              <th>Rated</th>
              <th>{data.user_a_username}</th>
              <th>{data.user_b_username}</th>
              <th>Mean</th>
              <th>{data.user_a_username} ↔ {data.user_b_username}</th>
              <th>{data.user_a_username} ↔ Spotify</th>
              <th>{data.user_b_username} ↔ Spotify</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr
                key={e.album.id}
                className={styles.row}
                onClick={() =>
                  navigate(`/friendships/${data.friendship_id}/albums/${e.album.spotify_id}`)
                }
              >
                <td>
                  {e.album.album_art_url && (
                    <img src={e.album.album_art_url} alt="" className={styles.albumArt} />
                  )}
                  <strong>{e.album.title}</strong>
                  <br />
                  <small>{e.album.artist}</small>
                </td>
                <td>{e.album.release_date}</td>
                <td>{e.mutual_date.slice(0, 10)}</td>
                <td>{e.user_a_score.toFixed(1)}</td>
                <td>{e.user_b_score.toFixed(1)}</td>
                <td>{e.mean_score.toFixed(2)}</td>
                <td>{fmt(e.similarity_users)}</td>
                <td>{fmt(e.similarity_a_vs_spotify)}</td>
                <td>{fmt(e.similarity_b_vs_spotify)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(3);
}
