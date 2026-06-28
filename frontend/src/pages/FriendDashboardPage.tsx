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
import { useNavigate } from "react-router-dom";
import {
  getFriendDashboard,
  type FriendDashboardEntry,
  type FriendDashboardResponse,
} from "../api/friendDashboard";
import { chartPalette } from "../lib/chartTheme";
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

type SortColumn =
  | "album"
  | "release"
  | "rated"
  | "a-score"
  | "b-score"
  | "mean"
  | "pair-similarity"
  | "a-similarity"
  | "b-similarity";

type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

type Mode = "similarity" | "ratings";

const A_COLOR = chartPalette.mint;
const B_COLOR = chartPalette.coral;
const PAIR_COLOR = chartPalette.sky;
const MEAN_COLOR = chartPalette.ink;

export function FriendDashboard({ friendshipId }: { friendshipId: number }) {
  const navigate = useNavigate();

  const [data, setData] = useState<FriendDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sort, setSort] = useState<SortState | null>(null);
  const [artistFilter, setArtistFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cumulative, setCumulative] = useState(false);
  const [mode, setMode] = useState<Mode>("similarity");

  useEffect(() => {
    setError(null);
    setData(null);
    getFriendDashboard(friendshipId)
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
    if (sort === null) return arr;
    const dir = sort.direction === "asc" ? 1 : -1;
    const sim = (v: number | null) => v ?? -Infinity;
    const cmp = (a: FriendDashboardEntry, b: FriendDashboardEntry): number => {
      switch (sort.column) {
        case "album":
          return a.album.title.localeCompare(b.album.title) * dir;
        case "release":
          return a.album.release_date.localeCompare(b.album.release_date) * dir;
        case "rated":
          return a.mutual_date.localeCompare(b.mutual_date) * dir;
        case "a-score":
          return (a.user_a_score - b.user_a_score) * dir;
        case "b-score":
          return (a.user_b_score - b.user_b_score) * dir;
        case "mean":
          return (a.mean_score - b.mean_score) * dir;
        case "pair-similarity":
          return (sim(a.similarity_users) - sim(b.similarity_users)) * dir;
        case "a-similarity":
          return (sim(a.similarity_a_vs_spotify) - sim(b.similarity_a_vs_spotify)) * dir;
        case "b-similarity":
          return (sim(a.similarity_b_vs_spotify) - sim(b.similarity_b_vs_spotify)) * dir;
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

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <>
      <header className={styles.header}>
        <h2 style={{ margin: 0 }}>
          {data.user_a_username} ↔ {data.user_b_username}
        </h2>
        <p>Albums you've both published a rating for.</p>
      </header>

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
              className={`${styles.seg} ${mode === "ratings" ? styles.segActive : ""}`}
              onClick={() => setMode("ratings")}
              aria-pressed={mode === "ratings"}
            >
              Ratings
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
              <SortableHeader label="Album" column="album" sort={sort} onClick={cycleSort} align="left" />
              <SortableHeader label="Released" column="release" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Rated" column="rated" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label={data.user_a_username} column="a-score" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label={data.user_b_username} column="b-score" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label="Mean" column="mean" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label={`${data.user_a_username} ↔ ${data.user_b_username}`} column="pair-similarity" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label={`${data.user_a_username} ↔ Spotify`} column="a-similarity" sort={sort} onClick={cycleSort} align="right" />
              <SortableHeader label={`${data.user_b_username} ↔ Spotify`} column="b-similarity" sort={sort} onClick={cycleSort} align="right" />
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
                <td className={styles.numCell}>{e.album.release_date}</td>
                <td className={styles.numCell}>{e.mutual_date.slice(0, 10)}</td>
                <td className={styles.numCell}>{e.user_a_score.toFixed(1)}</td>
                <td className={styles.numCell}>{e.user_b_score.toFixed(1)}</td>
                <td className={styles.numCell}>{e.mean_score.toFixed(2)}</td>
                <td className={styles.numCell}>{fmt(e.similarity_users)}</td>
                <td className={styles.numCell}>{fmt(e.similarity_a_vs_spotify)}</td>
                <td className={styles.numCell}>{fmt(e.similarity_b_vs_spotify)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(3);
}

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
