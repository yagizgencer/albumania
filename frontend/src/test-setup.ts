import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; SketchUnderline (Rough.js) observes its size.
// A no-op stub is enough — tests don't assert on the drawn SVG.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
