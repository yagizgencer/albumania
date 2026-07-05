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

// React Router v7's data router builds a `Request` (with an AbortSignal) per
// navigation; jsdom's `AbortSignal` isn't accepted by Node's undici `Request`, so
// a *completed* data-router navigation rejects with "Expected signal to be an
// instance of AbortSignal". This is purely a jsdom/undici mismatch — navigation
// works in real browsers. Swallow only that specific rejection so tests that
// trigger a navigation (e.g. publish → redirect) don't fail the suite.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("Expected signal") && msg.includes("AbortSignal")) return;
  throw reason;
});

