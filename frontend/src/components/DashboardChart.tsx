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
import zoomPlugin from "chartjs-plugin-zoom";
import { useEffect, useRef } from "react";
import { Line } from "react-chartjs-2";
import styles from "../pages/ProfileDashboardPage.module.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

// Point radius shrinks as the dataset grows, so a user with hundreds of rated
// albums sees a clean line instead of a wall of overlapping dots. Hit-testing
// uses `nearest`, so hover + click still work even at radius 0.
function pointRadiusFor(count: number): number {
  if (count <= 60) return 3;
  if (count <= 150) return 2;
  if (count <= 300) return 1;
  return 0;
}

interface DashboardChartProps {
  /** Album titles in table order — used for the x categories (hidden) and tooltip title. */
  labels: string[];
  datasets: ChartData<"line">["datasets"];
  /** Called with the point index when a point (or the nearest line spot) is clicked. */
  onPointClick: (index: number) => void;
  /** Changing this value resets the zoom to the full range (we pass the sort state). */
  resetKey: unknown;
  beginAtZero: boolean;
}

export function DashboardChart({
  labels,
  datasets,
  onPointClick,
  resetKey,
  beginAtZero,
}: DashboardChartProps) {
  const chartRef = useRef<ChartJS<"line"> | null>(null);

  // Reset zoom whenever the sort (resetKey) changes — the plot re-orders to
  // match the table, so any prior zoom window is no longer meaningful.
  useEffect(() => {
    chartRef.current?.resetZoom();
  }, [resetKey]);

  const radius = pointRadiusFor(labels.length);

  return (
    <>
      <div className={styles.chartToolbar}>
        <button
          type="button"
          className={styles.fitBtn}
          onClick={() => chartRef.current?.resetZoom()}
        >
          Fit
        </button>
      </div>
      <Line
        ref={chartRef}
        data={{ labels, datasets }}
        options={{
          responsive: true,
          layout: { padding: { left: 12, right: 12 } },
          interaction: { mode: "nearest", intersect: false },
          onClick: (_evt, elements) => {
            if (elements.length > 0) onPointClick(elements[0].index);
          },
          elements: { point: { radius, hoverRadius: 5 } },
          plugins: {
            legend: { position: "top" as const },
            zoom: {
              zoom: {
                wheel: { enabled: true },
                drag: { enabled: true },
                mode: "x",
              },
              pan: { enabled: true, mode: "x" },
            },
          },
          scales: {
            x: { ticks: { display: false } },
            y: { beginAtZero },
          },
        }}
      />
    </>
  );
}
