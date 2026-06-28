import { useEffect, useRef } from "react";
import rough from "roughjs";

interface SketchUnderlineProps {
  /** Stroke color. Defaults to the cozy coral accent. */
  color?: string;
  /** Stroke thickness in px. */
  strokeWidth?: number;
}

const HEIGHT = 12;

/**
 * A hand-drawn underline rendered with Rough.js. It stretches to the width of
 * its parent and re-draws on resize, so it reads as a wobbly sketched line
 * under whatever heading it sits beneath. Decorative only (aria-hidden).
 */
export default function SketchUnderline({
  color = "#ff7a7a",
  strokeWidth = 2.5,
}: SketchUnderlineProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const draw = () => {
      const width = svg.clientWidth;
      if (width === 0) return;
      svg.replaceChildren();
      const rc = rough.svg(svg);
      // Slight vertical drift across the line gives it a relaxed, hand-drawn feel.
      const node = rc.line(2, HEIGHT - 4, width - 2, HEIGHT - 6, {
        stroke: color,
        strokeWidth,
        roughness: 1.6,
        bowing: 2,
      });
      svg.appendChild(node);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [color, strokeWidth]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      width="100%"
      height={HEIGHT}
      style={{ display: "block", overflow: "visible" }}
    />
  );
}
