import { describe, expect, it } from "vitest";

import { niceStep } from "./DashboardChart";

describe("niceStep", () => {
  it("returns a 1/2/5 × 10^n step that yields roughly the target tick count", () => {
    // A 0–10 score range → step 2 (→ 0,2,4,6,8,10).
    expect(niceStep(10)).toBe(2);
    // A 0–1 similarity range → step 0.2 (→ 0,0.2,…,1).
    expect(niceStep(1)).toBeCloseTo(0.2, 10);
    // Larger ranges scale up.
    expect(niceStep(100)).toBe(20);
    expect(niceStep(45)).toBe(10);
  });

  it("falls back to 1 for non-positive or non-finite ranges", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });

  it("produces evenly divisible bounds when used to round", () => {
    const step = niceStep(10 - 2); // padded score range
    const min = Math.floor(2 / step) * step;
    const max = Math.ceil(10 / step) * step;
    expect((max - min) % step).toBeCloseTo(0, 10);
  });
});
