import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFriendDashboard,
  type FriendDashboardEntry,
  type FriendDashboardResponse,
} from "../api/friendDashboard";
import { chartPalette } from "../lib/chartTheme";
import { usePersistentState } from "../lib/usePersistentState";
import { formatDate } from "../lib/date";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { DashboardChart, type ChartView } from "../components/DashboardChart";
import { DashboardAlbumCell } from "../components/DashboardAlbumCell";
import { MetricSwitch } from "../components/MetricSwitch";
import styles from "./ProfileDashboardPage.module.css";

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

  // Persisted per friendship so opening an album and coming back keeps the view.
  const ns = `dash:pair:${friendshipId}`;
  const [sort, setSort] = usePersistentState<SortState | null>(`${ns}:sort`, null);
  const [artistFilter, setArtistFilter] = usePersistentState(`${ns}:filter`, "");
  const [fromDate, setFromDate] = usePersistentState(`${ns}:from`, "");
  const [toDate, setToDate] = usePersistentState(`${ns}:to`, "");
  const [mode, setMode] = usePersistentState<Mode>(`${ns}:mode`, "similarity");
  const [view, setView] = usePersistentState<ChartView>(`${ns}:view`, "detailed");

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

  // Plot follows the table order, so sorting re-orders the lines.
  const chartData = useMemo(() => {
    const labels = sorted.map((e) => e.album.title);
    const series = (values: (number | null)[]) => values.map((v) => v ?? 0);

    const aLabel = data?.user_a_username ?? "User A";
    const bLabel = data?.user_b_username ?? "User B";

    const datasets =
      mode === "similarity"
        ? [
            {
              label: `${aLabel} ↔ ${bLabel}`,
              data: series(sorted.map((e) => e.similarity_users)),
              borderColor: PAIR_COLOR,
              backgroundColor: PAIR_COLOR,
              tension: 0.25,
            },
            {
              label: `${aLabel} ↔ Spotify`,
              data: series(sorted.map((e) => e.similarity_a_vs_spotify)),
              borderColor: A_COLOR,
              backgroundColor: A_COLOR,
              tension: 0.25,
            },
            {
              label: `${bLabel} ↔ Spotify`,
              data: series(sorted.map((e) => e.similarity_b_vs_spotify)),
              borderColor: B_COLOR,
              backgroundColor: B_COLOR,
              tension: 0.25,
            },
          ]
        : [
            {
              label: `${aLabel} score`,
              data: series(sorted.map((e) => e.user_a_score)),
              borderColor: A_COLOR,
              backgroundColor: A_COLOR,
              tension: 0.25,
            },
            {
              label: `${bLabel} score`,
              data: series(sorted.map((e) => e.user_b_score)),
              borderColor: B_COLOR,
              backgroundColor: B_COLOR,
              tension: 0.25,
            },
            {
              label: "Mean",
              data: series(sorted.map((e) => e.mean_score)),
              borderColor: MEAN_COLOR,
              backgroundColor: MEAN_COLOR,
              tension: 0.25,
            },
          ];

    return { labels, datasets };
  }, [sorted, mode, data]);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <LoadingState />;

  const a = data.user_a_username;
  const b = data.user_b_username;

  return (
    <>
      <header className={styles.header}>
        <h2 style={{ margin: 0 }}>
          {data.user_a_username} ↔ {data.user_b_username}
        </h2>
        <p>Albums you've both published a rating for.</p>
      </header>

      <section className={styles.controls}>
        <MetricSwitch
          label="Metric"
          options={[
            { value: "similarity", label: "Similarity" },
            { value: "ratings", label: "Ratings" },
          ]}
          value={mode}
          onChange={setMode}
        />

        <MetricSwitch
          label="View"
          options={[
            { value: "detailed", label: "Detailed" },
            { value: "overview", label: "Overview" },
          ]}
          value={view}
          onChange={setView}
        />

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
          <DashboardChart
            labels={chartData.labels}
            datasets={chartData.datasets}
            onPointClick={(i) =>
              navigate(`/friendships/${data.friendship_id}/albums/${sorted[i].album.spotify_id}`)
            }
            beginAtZero={mode === "ratings"}
            view={view}
            sortKey={sort}
          />
        )}
      </section>

      {sorted.length === 0 ? (
        <p className={styles.empty}>No mutual ratings yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableHeader label="Album" column="album" sort={sort} onClick={cycleSort} align="left" />
                <SortableHeader label="Released" column="release" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label="Rated" column="rated" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label={trunc(a)} title={a} column="a-score" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label={trunc(b)} title={b} column="b-score" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label="Mean" column="mean" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label={stack(trunc(a), trunc(b))} title={`${a} ↔ ${b}`} column="pair-similarity" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label={stack(trunc(a), "Spotify")} title={`${a} ↔ Spotify`} column="a-similarity" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label={stack(trunc(b), "Spotify")} title={`${b} ↔ Spotify`} column="b-similarity" sort={sort} onClick={cycleSort} align="right" />
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
                    <DashboardAlbumCell album={e.album} />
                  </td>
                  <td className={styles.numCell}>{formatDate(e.album.release_date)}</td>
                  <td className={styles.numCell}>{formatDate(e.mutual_date)}</td>
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
        </div>
      )}
    </>
  );
}

function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(3);
}

function trunc(s: string, n = 12): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Vertical "userA ↔ userB" header so similarity columns stay narrow.
function stack(top: string, bottom: string): ReactNode {
  return (
    <span className={styles.stackHeader}>
      <span>{top}</span>
      <span>↔</span>
      <span>{bottom}</span>
    </span>
  );
}

function SortableHeader({
  label,
  title,
  column,
  sort,
  onClick,
  align,
}: {
  label: ReactNode;
  title?: string;
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
      title={title}
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
