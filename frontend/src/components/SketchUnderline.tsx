import { useEffect, useRef } from "react";
import rough from "roughjs";

interface SketchUnderlineProps {
  /** Stroke color. Accepts a raw color OR a CSS custom property name
   *  (e.g. "--accent"), which is resolved against :root so it follows the theme.
   *  Defaults to the primary accent token. */
  color?: string;
  /** Stroke thickness in px. */
  strokeWidth?: number;
}

const HEIGHT = 12;

/** Resolve a `--token` / `var(--token)` to its computed value; pass through raw colors. */
function resolveColor(color: string): string {
  const name = color.startsWith("var(")
    ? color.slice(4, -1).trim()
    : color.startsWith("--")
      ? color
      : null;
  if (!name) return color;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || "#d47a52";
}

/**
 * A hand-drawn underline rendered with Rough.js. It stretches to the width of
 * its parent and re-draws on resize, so it reads as a wobbly sketched line
 * under whatever heading it sits beneath. Decorative only (aria-hidden).
 */
export default function SketchUnderline({
  color = "--accent",
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
        stroke: resolveColor(color),
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
