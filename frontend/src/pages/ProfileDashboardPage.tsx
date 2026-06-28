import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import { chartFill, chartPalette } from "../lib/chartTheme";
import { usePersistentState } from "../lib/usePersistentState";
import { formatDate } from "../lib/date";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { DashboardChart, type ChartView } from "../components/DashboardChart";
import { MetricSwitch } from "../components/MetricSwitch";
import styles from "./ProfileDashboardPage.module.css";

type SortColumn = "album" | "release" | "rated" | "score" | "similarity";
type SortDirection = "asc" | "desc";
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
type Mode = "similarity" | "rating";

export function ProfileDashboard({ username }: { username: string }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<DashboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persisted per profile so opening an album and coming back keeps the view.
  const ns = `dash:solo:${username}`;
  const [sort, setSort] = usePersistentState<SortState | null>(`${ns}:sort`, null);
  const [artistFilter, setArtistFilter] = usePersistentState(`${ns}:filter`, "");
  const [fromDate, setFromDate] = usePersistentState(`${ns}:from`, "");
  const [toDate, setToDate] = usePersistentState(`${ns}:to`, "");
  const [mode, setMode] = usePersistentState<Mode>(`${ns}:mode`, "similarity");
  const [view, setView] = usePersistentState<ChartView>(`${ns}:view`, "detailed");

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
        case "release":
          return a.album.release_date.localeCompare(b.album.release_date) * dir;
        case "rated":
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

  // Plot follows the table order, so sorting re-orders the line.
  const chartData = useMemo(
    () => ({
      labels: sorted.map((e) => e.album.title),
      datasets: [
        {
          label: mode === "rating" ? "Score" : "Similarity vs Spotify",
          data: sorted.map((e) =>
            mode === "rating" ? e.score : e.similarity_user_vs_spotify ?? 0
          ),
          borderColor: chartPalette.lavender,
          backgroundColor: chartFill.lavender,
          tension: 0.25,
        },
      ],
    }),
    [sorted, mode]
  );

  if (error) return <Alert>{error}</Alert>;
  if (!entries) return <LoadingState />;

  return (
    <>
      <section className={styles.controls}>
        <MetricSwitch
          label="Metric"
          options={[
            { value: "similarity", label: "Similarity" },
            { value: "rating", label: "Rating" },
          ]}
          value={mode}
          onChange={setMode}
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
          <p className={styles.empty}>No ratings match the current filters.</p>
        ) : (
          <DashboardChart
            labels={chartData.labels}
            datasets={chartData.datasets}
            onPointClick={(i) =>
              navigate(`/users/${username}/albums/${sorted[i].album.spotify_id}`)
            }
            beginAtZero={mode === "rating"}
            view={view}
            onViewChange={setView}
            sortKey={sort}
          />
        )}
      </section>

      {sorted.length === 0 ? (
        <p className={styles.empty}>No published ratings yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableHeader label="Album" column="album" sort={sort} onClick={cycleSort} align="left" />
                <SortableHeader label="Released" column="release" sort={sort} onClick={cycleSort} align="right" />
                <SortableHeader label="Rated" column="rated" sort={sort} onClick={cycleSort} align="right" />
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
                  <td className={styles.numCell}>{formatDate(e.album.release_date)}</td>
                  <td className={styles.numCell}>{formatDate(e.completed_at)}</td>
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
        </div>
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
