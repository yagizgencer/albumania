import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { FeaturesProvider, useFeatures } from "./FeaturesContext";
import * as featuresApi from "../api/features";

function Probe() {
  const { spotifyComparison } = useFeatures();
  return <span>{spotifyComparison ? "comparison-on" : "comparison-off"}</span>;
}

describe("FeaturesProvider", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("starts disabled so no comparison UI flashes before the backend answers", () => {
    vi.spyOn(featuresApi, "getFeatures").mockReturnValue(new Promise(() => {}));
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>
    );
    expect(screen.getByText("comparison-off")).toBeInTheDocument();
  });

  it("enables the comparison when the backend reports it on", async () => {
    vi.spyOn(featuresApi, "getFeatures").mockResolvedValue({ spotifyComparison: true });
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>
    );
    await waitFor(() => expect(screen.getByText("comparison-on")).toBeInTheDocument());
  });

  it("stays disabled when the request fails", async () => {
    // A failed lookup must degrade to "hidden", never to a half-rendered panel.
    vi.spyOn(featuresApi, "getFeatures").mockRejectedValue(new Error("offline"));
    render(
      <FeaturesProvider>
        <Probe />
      </FeaturesProvider>
    );
    await waitFor(() => expect(screen.getByText("comparison-off")).toBeInTheDocument());
  });
});
