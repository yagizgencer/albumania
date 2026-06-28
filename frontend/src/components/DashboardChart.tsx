import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type ChartData,
} from "chart.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import styles from "../pages/ProfileDashboardPage.module.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export type ChartView = "detailed" | "overview";

const DETAILED_VISIBLE = 10; // points shown per window in Detailed mode
const LABEL_MAX = 16;
const MIN_SPAN = 2;

interface DashboardChartProps {
  /** Album titles in table order — x categories + tooltip titles. */
  labels: string[];
  datasets: ChartData<"line">["datasets"];
  onPointClick: (index: number) => void;
  beginAtZero: boolean;
  view: ChartView;
  /** Changing this (the sort state) resets the window. */
  sortKey: unknown;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function truncate(s: string): string {
  return s.length > LABEL_MAX ? `${s.slice(0, LABEL_MAX - 1)}…` : s;
}

function radiusFor(spacingPx: number): number {
  if (spacingPx > 24) return 3;
  if (spacingPx > 10) return 2;
  if (spacingPx > 4) return 1;
  return 0;
}

export function DashboardChart({
  labels,
  datasets,
  onPointClick,
  beginAtZero,
  view,
  sortKey,
}: DashboardChartProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(800);
  const suppressClick = useRef(false);

  const points = labels.length;

  // The visible window: `span` points starting at index `start`. The canvas
  // itself never overflows, so the y-axis + legend always stay in view — only
  // the x range scrolls/zooms.
  const [span, setSpan] = useState(points);
  const [start, setStart] = useState(0);

  // (Re)initialize the window when the mode or sort changes.
  useEffect(() => {
    setSpan(view === "detailed" ? Math.min(DETAILED_VISIBLE, points) : points);
    setStart(0);
  }, [view, sortKey, points]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const effSpan = clamp(span, MIN_SPAN, points || MIN_SPAN);
  const maxStart = Math.max(0, points - effSpan);
  const effStart = clamp(start, 0, maxStart);

  const panBy = (deltaPoints: number) =>
    setStart(clamp(effStart + deltaPoints, 0, maxStart));

  // Zoom keeps the album under `anchorFraction` (0..1 across the window) in place.
  const zoomBy = (factor: number, anchorFraction = 0.5) => {
    const newSpan = clamp(Math.round(effSpan * factor), MIN_SPAN, points);
    const anchorIndex = effStart + anchorFraction * effSpan;
    const newStart = clamp(
      Math.round(anchorIndex - anchorFraction * newSpan),
      0,
      Math.max(0, points - newSpan)
    );
    setSpan(newSpan);
    setStart(newStart);
  };

  // Non-passive wheel: zoom in overview, scroll the window in detailed.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (view === "overview") {
        if (points <= MIN_SPAN) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 0.85 : 1 / 0.85, (e.clientX - rect.left) / rect.width);
      } else if (points > effSpan) {
        e.preventDefault();
        panBy(Math.sign(e.deltaY + e.deltaX) * Math.max(1, Math.round(effSpan * 0.2)));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, effSpan, effStart, maxStart, points]);

  // Drag-to-pan, with click suppression so a drag doesn't navigate.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let dragging = false;
    let downX = 0;
    let startAtDown = 0;
    let moved = false;
    const pointWidth = containerW / Math.max(1, effSpan);

    const down = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      downX = e.clientX;
      startAtDown = effStart;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - downX;
      if (Math.abs(dx) > 4) moved = true;
      setStart(clamp(Math.round(startAtDown - dx / pointWidth), 0, maxStart));
    };
    const up = () => {
      if (moved) {
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
      }
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [containerW, effSpan, effStart, maxStart]);

  // Fixed y-range across the whole dataset, so windowing never rescales y.
  const yBounds = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const ds of datasets) {
      for (const v of ds.data as (number | null)[]) {
        if (typeof v === "number" && !Number.isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (min === Infinity) return { min: undefined as number | undefined, max: undefined as number | undefined };
    const pad = (max - min) * 0.08 || 1;
    return { min: beginAtZero ? 0 : min - pad, max: max + pad };
  }, [datasets, beginAtZero]);

  const radius = radiusFor(containerW / Math.max(1, effSpan));

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      layout: { padding: { left: 12, right: 12 } },
      interaction: { mode: "nearest" as const, intersect: false },
      onClick: (_evt: unknown, elements: { index: number }[]) => {
        if (suppressClick.current) return;
        if (elements.length > 0) onPointClick(elements[0].index);
      },
      elements: { point: { radius, hoverRadius: 5 } },
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          callbacks: {
            title: (items: { dataIndex: number }[]) =>
              items.length ? labels[items[0].dataIndex] ?? "" : "",
          },
        },
      },
      scales: {
        x: {
          min: effStart,
          max: effStart + effSpan - 1,
          offset: true,
          ticks: {
            display: view === "detailed",
            autoSkip: false,
            maxRotation: 60,
            minRotation: 45,
            // category scale passes the absolute label index as the value
            callback: (value: number) => truncate(labels[value] ?? ""),
          },
        },
        y: { min: yBounds.min, max: yBounds.max },
      },
    }),
    [view, labels, radius, onPointClick, effStart, effSpan, yBounds]
  );

  const scrollable = points > effSpan;

  return (
    <>
      {view === "overview" && (
        <div className={styles.chartHeader}>
          <div className={styles.toolbox} role="group" aria-label="Zoom and pan">
            <button type="button" className={styles.toolBtn} onClick={() => panBy(-Math.max(1, Math.round(effSpan * 0.3)))} aria-label="Pan left">‹</button>
            <button type="button" className={styles.toolBtn} onClick={() => zoomBy(1 / 0.8)} aria-label="Zoom out">−</button>
            <button type="button" className={styles.toolBtn} onClick={() => zoomBy(0.8)} aria-label="Zoom in">+</button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => {
                setSpan(points);
                setStart(0);
              }}
              aria-label="Fit"
            >
              Fit
            </button>
            <button type="button" className={styles.toolBtn} onClick={() => panBy(Math.max(1, Math.round(effSpan * 0.3)))} aria-label="Pan right">›</button>
          </div>
        </div>
      )}

      <div ref={boxRef} className={styles.chartBox}>
        <Line data={{ labels, datasets }} options={options} />
      </div>

      {scrollable && (
        <input
          type="range"
          className={styles.chartScrollbar}
          min={0}
          max={maxStart}
          step={1}
          value={effStart}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Scroll the chart left and right"
        />
      )}
    </>
  );
}
