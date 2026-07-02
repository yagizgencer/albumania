import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard, type DashboardEntry } from "../api/dashboard";
import { chartFill, chartPalette } from "../lib/chartTheme";
import { usePersistentState } from "../lib/usePersistentState";
import { formatDate } from "../lib/date";
import { Alert } from "../components/Alert";
import { LoadingState } from "../components/Spinner";
import { DashboardChart, type ChartView } from "../components/DashboardChart";
import { DashboardAlbumCell } from "../components/DashboardAlbumCell";
import { MetricSwitch } from "../components/MetricSwitch";
import styles from "./ProfileDashboardPage.module.css";

type SortColumn = "album" | "release" | "rated" | "score" | "similarity";
type SortDirection = "asc" | "desc";
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
type Mode = "similarity" | "rating";

export function ProfileDashboard({
  username,
  onAccessBlocked,
}: {
  username: string;
  /** Called when the dashboard can't be shown because the profile is private
   *  (403) so the parent can render a nicer explanation instead of a bare
   *  alert. Passing "private" | "friends-only" | null (cleared on success). */
  onAccessBlocked?: (reason: "private" | "friends-only" | null) => void;
}) {
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
      .then((data) => {
        setEntries(data.entries);
        onAccessBlocked?.(null);
      })
      .catch((err) => {
        if (err?.response?.status === 403) {
          // The backend distinguishes fully-private from friends-only via the
          // detail message; fall back to "private" if it's absent.
          const detail: string = err?.response?.data?.detail ?? "";
          const reason = detail.toLowerCase().includes("friend")
            ? "friends-only"
            : "private";
          onAccessBlocked?.(reason);
          setError(
            reason === "friends-only"
              ? "This profile is visible to friends only."
              : "This profile is private."
          );
        } else if (err?.response?.status === 404) {
          setError("User not found.");
        } else {
          setError("Could not load dashboard.");
        }
      });
    // onAccessBlocked is a stable callback from the parent; re-running only on
    // username change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // When the profile is private/friends-only the parent renders a dedicated
  // explanation card, so stay silent here to avoid a duplicate message.
  if (error) return onAccessBlocked ? null : <Alert>{error}</Alert>;
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
                <SortableHeader
                  label={stack(trunc(username), "Spotify")}
                  title={`${username} ↔ Spotify`}
                  column="similarity"
                  sort={sort}
                  onClick={cycleSort}
                  align="right"
                />
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
                    <DashboardAlbumCell album={e.album} />
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

// Vertical "username ↔ Spotify" header so the similarity column stays narrow,
// matching the friend dashboard's stacked headers.
function stack(top: string, bottom: string): ReactNode {
  return (
    <span className={styles.stackHeader}>
      <span>{top}</span>
      <span>↔</span>
      <span>{bottom}</span>
    </span>
  );
}

function trunc(s: string): string {
  return s.length > 12 ? `${s.slice(0, 11)}…` : s;
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
