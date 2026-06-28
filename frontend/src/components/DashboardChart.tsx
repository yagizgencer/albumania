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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const DETAILED_VISIBLE = 10; // points per viewport in Detailed mode
const MAX_ZOOM = 20;
const LABEL_MAX = 16;

interface DashboardChartProps {
  /** Album titles in table order — x categories + tooltip titles. */
  labels: string[];
  datasets: ChartData<"line">["datasets"];
  onPointClick: (index: number) => void;
  beginAtZero: boolean;
  view: ChartView;
  onViewChange: (view: ChartView) => void;
  /** Changing this (the sort state) resets zoom/scroll to default. */
  sortKey: unknown;
}

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
  onViewChange,
  sortKey,
}: DashboardChartProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [zoom, setZoom] = useState(1); // overview only; 1 = fit

  // Suppress the chart's click-to-navigate right after a pan-drag.
  const suppressClick = useRef(false);
  // Pending scroll anchor applied after a zoom change (keeps a point in place).
  const pendingAnchor = useRef<{ fraction: number; viewportX: number } | null>(null);

  const points = labels.length;

  // Measure the viewport width so we can size the canvas.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Reset zoom + scroll when the mode or the sort changes.
  useEffect(() => {
    setZoom(1);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [view, sortKey]);

  const base = containerW || 800;
  const contentWidth =
    view === "detailed"
      ? points <= DETAILED_VISIBLE
        ? base
        : Math.round(points * (base / DETAILED_VISIBLE))
      : Math.round(base * zoom);

  // After a zoom change, restore the anchored point's screen position.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = pendingAnchor.current;
    if (!el || !anchor) return;
    pendingAnchor.current = null;
    el.scrollLeft = anchor.fraction * contentWidth - anchor.viewportX;
  }, [contentWidth]);

  const applyZoom = useCallback(
    (next: number, viewportX: number) => {
      const el = scrollRef.current;
      const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
      if (el && containerW > 0) {
        const fraction = (el.scrollLeft + viewportX) / (containerW * zoom);
        pendingAnchor.current = { fraction, viewportX };
      }
      setZoom(clamped);
    },
    [containerW, zoom]
  );

  // Non-passive wheel: zoom in overview, horizontal-scroll in detailed.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (view === "overview") {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        applyZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - rect.left);
      } else if (contentWidth > containerW) {
        e.preventDefault();
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, zoom, contentWidth, containerW, applyZoom]);

  // Drag-to-pan (both modes), with click suppression so a drag doesn't navigate.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    const down = (e: PointerEvent) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = startScroll - dx;
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
  }, []);

  const spacing = points > 0 ? contentWidth / points : contentWidth;
  const radius = radiusFor(spacing);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
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
          ticks: {
            display: view === "detailed",
            autoSkip: false,
            maxRotation: 60,
            minRotation: 45,
            callback: (_v: unknown, index: number) => truncate(labels[index] ?? ""),
          },
        },
        y: { beginAtZero },
      },
    }),
    [view, beginAtZero, radius, labels, onPointClick]
  );

  const panBy = (dir: -1 | 1) => {
    if (scrollRef.current) scrollRef.current.scrollLeft += dir * containerW * 0.3;
  };

  return (
    <>
      <div className={styles.chartHeader}>
        <div className={styles.segmented} role="group" aria-label="Chart view">
          <button
            type="button"
            className={`${styles.seg} ${view === "detailed" ? styles.segActive : ""}`}
            onClick={() => onViewChange("detailed")}
            aria-pressed={view === "detailed"}
          >
            Detailed
          </button>
          <button
            type="button"
            className={`${styles.seg} ${view === "overview" ? styles.segActive : ""}`}
            onClick={() => onViewChange("overview")}
            aria-pressed={view === "overview"}
          >
            Overview
          </button>
        </div>

        {view === "overview" && (
          <div className={styles.toolbox} role="group" aria-label="Zoom and pan">
            <button type="button" className={styles.toolBtn} onClick={() => panBy(-1)} aria-label="Pan left">‹</button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => applyZoom(zoom / 1.25, containerW / 2)}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => applyZoom(zoom * 1.25, containerW / 2)}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className={styles.toolBtn}
              onClick={() => {
                setZoom(1);
                if (scrollRef.current) scrollRef.current.scrollLeft = 0;
              }}
              aria-label="Fit"
            >
              Fit
            </button>
            <button type="button" className={styles.toolBtn} onClick={() => panBy(1)} aria-label="Pan right">›</button>
          </div>
        )}
      </div>

      <div ref={scrollRef} className={styles.scrollArea}>
        <div className={styles.sizer} style={{ width: containerW ? contentWidth : "100%" }}>
          <Line data={{ labels, datasets }} options={options} />
        </div>
      </div>
    </>
  );
}
