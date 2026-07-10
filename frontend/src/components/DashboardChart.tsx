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
  type ChartEvent,
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

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => HTML_ESCAPE[c]);

/** In detailed mode, map a canvas (x, y) below the plot onto the album index
 *  whose x-axis label sits there (so the tilted album names act as links).
 *  Returns null when not over a label. */
function labelIndexAt(
  chart: ChartJS,
  x: number,
  y: number,
  view: ChartView,
  count: number
): number | null {
  if (view !== "detailed") return null;
  const area = chart.chartArea;
  if (y <= area.bottom || x < area.left || x > area.right) return null;
  const raw = chart.scales.x?.getValueForPixel(x);
  if (raw == null) return null;
  const idx = Math.round(raw);
  return idx >= 0 && idx < count ? idx : null;
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

// A "nice" step (1, 2, or 5 × 10^n) so the y-axis lands ~`targetTicks` evenly
// spaced gridlines instead of Chart.js's auto-spacing.
export function niceStep(range: number, targetTicks = 5): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
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
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  // The x-axis album label currently hovered (detailed mode) → underline it.
  const hoverLabelRef = useRef<number | null>(null);
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
    if (min === Infinity) {
      return {
        min: undefined as number | undefined,
        max: undefined as number | undefined,
        stepSize: undefined as number | undefined,
      };
    }
    const pad = (max - min) * 0.08 || 1;
    const paddedMin = beginAtZero ? 0 : min - pad;
    const paddedMax = max + pad;
    // Round the bounds to whole steps so every gridline sits on a step multiple.
    const step = niceStep(paddedMax - paddedMin);
    return {
      min: Math.floor(paddedMin / step) * step,
      max: Math.ceil(paddedMax / step) * step,
      stepSize: step,
    };
  }, [datasets, beginAtZero]);

  const radius = radiusFor(containerW / Math.max(1, effSpan));

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      layout: { padding: { left: 12, right: 12 } },
      // `intersect: true` so the tooltip only appears when actually near a point
      // (not snapping to the nearest one from anywhere in the plot). A small
      // hitRadius (below) keeps points easy to hover.
      interaction: { mode: "nearest" as const, intersect: true },
      onClick: (evt: ChartEvent, elements: { index: number }[], chart: ChartJS) => {
        if (suppressClick.current) return;
        // A click on an x-axis album label (detailed mode) takes precedence over
        // the "nearest" point Chart.js reports so the label maps to the album
        // directly under it.
        const labelIdx = labelIndexAt(chart, evt.x ?? 0, evt.y ?? 0, view, labels.length);
        if (labelIdx !== null) {
          onPointClick(labelIdx);
          return;
        }
        if (elements.length > 0) onPointClick(elements[0].index);
      },
      elements: { point: { radius, hoverRadius: 6, hitRadius: 8 } },
      plugins: {
        legend: { position: "top" as const },
        tooltip: {
          // Custom HTML tooltip so the album name can read as an (underlined) link.
          enabled: false,
          external: (ctx: {
            chart: ChartJS;
            tooltip: {
              opacity: number;
              title?: string[];
              body?: { lines: string[] }[];
              caretX: number;
              caretY: number;
            };
          }) => {
            const el = tooltipRef.current;
            if (!el) return;
            const tt = ctx.tooltip;
            if (tt.opacity === 0) {
              el.style.opacity = "0";
              return;
            }
            const title = tt.title?.[0] ?? "";
            const line = tt.body?.[0]?.lines?.[0] ?? "";
            el.innerHTML =
              `<span class="${styles.ttAlbum}">${esc(title)}</span>` +
              `<span class="${styles.ttValue}">${esc(line)}</span>`;
            el.style.opacity = "1";
            el.style.left = `${ctx.chart.canvas.offsetLeft + tt.caretX}px`;
            el.style.top = `${ctx.chart.canvas.offsetTop + tt.caretY}px`;
          },
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
        y: {
          min: yBounds.min,
          max: yBounds.max,
          ticks: { stepSize: yBounds.stepSize },
        },
      },
    }),
    [view, labels, radius, onPointClick, effStart, effSpan, yBounds]
  );

  // Own the hover detection (Chart.js's throttled onHover was unreliable — it
  // stuck/missed). On every pointer move over the box, resolve the x-axis album
  // label under the cursor from its position, set the cursor, and redraw only
  // when the underlined label changes. Cleared on leave.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const move = (e: MouseEvent) => {
      const chart = chartRef.current;
      if (!chart) return;
      const rect = chart.canvas.getBoundingClientRect();
      const idx = labelIndexAt(
        chart,
        e.clientX - rect.left,
        e.clientY - rect.top,
        view,
        labels.length
      );
      const overPoint =
        chart.getElementsAtEventForMode(e, "nearest", { intersect: true }, false).length > 0;
      el.style.cursor = idx !== null || overPoint ? "pointer" : "default";
      if (idx !== hoverLabelRef.current) {
        hoverLabelRef.current = idx;
        chart.draw();
      }
    };
    const leave = () => {
      el.style.cursor = "default";
      if (hoverLabelRef.current !== null) {
        hoverLabelRef.current = null;
        chartRef.current?.draw();
      }
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
    };
  }, [view, labels.length]);

  // Draws the underline under the hovered x-axis label, reusing Chart.js's own
  // computed label geometry (`_labelItems`) so it lines up with the tilted text.
  const underlinePlugin = useMemo(
    () => ({
      id: "axisHoverUnderline",
      afterDraw(chart: ChartJS) {
        const idx = hoverLabelRef.current;
        if (idx == null || view !== "detailed") return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scale = chart.scales.x as any;
        // In Chart.js v4 each cached label item is
        // `{ label, font, textOffset, options: { translation:[x,y], rotation,
        //   textAlign, textBaseline } }`.
        const items = scale?._labelItems as
          | {
              label?: string | string[];
              font?: { string?: string; size?: number };
              textOffset?: number;
              options?: {
                translation?: [number, number];
                rotation?: number;
                textAlign?: string;
                textBaseline?: string;
              };
            }[]
          | undefined;
        const ticks = scale?.ticks as { value: number }[] | undefined;
        if (!items || !ticks) return;
        const pos = ticks.findIndex((t) => t.value === idx);
        if (pos < 0 || pos >= items.length) return;
        const item = items[pos];
        const opt = item.options ?? {};
        const [tx, ty] = opt.translation ?? [0, 0];
        const ctx = chart.ctx;
        ctx.save();
        ctx.translate(tx, ty);
        if (opt.rotation) ctx.rotate(opt.rotation);
        ctx.font = item.font?.string ?? `${ChartJS.defaults.font.size}px ${ChartJS.defaults.font.family}`;
        const text = Array.isArray(item.label) ? item.label.join(" ") : item.label ?? "";
        const w = ctx.measureText(text).width;
        let x0 = -w;
        let x1 = 0;
        if (opt.textAlign === "left") { x0 = 0; x1 = w; }
        else if (opt.textAlign === "center") { x0 = -w / 2; x1 = w / 2; }
        const fs = item.font?.size ?? ChartJS.defaults.font.size ?? 13;
        const off = item.textOffset ?? 0;
        const uy =
          opt.textBaseline === "top"
            ? off + fs + 2
            : opt.textBaseline === "bottom"
            ? off + 2
            : off + fs * 0.5 + 2;
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
        ctx.strokeStyle = accent || (ChartJS.defaults.color as string);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, uy);
        ctx.lineTo(x1, uy);
        ctx.stroke();
        ctx.restore();
      },
    }),
    [view]
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
        <Line
          ref={chartRef}
          data={{ labels, datasets }}
          options={options}
          plugins={[underlinePlugin]}
        />
        <div ref={tooltipRef} className={styles.chartTooltip} aria-hidden />
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
