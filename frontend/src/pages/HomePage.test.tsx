import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./HomePage";
import { getFeed, getTrendingAlbums, getTrendingArtists } from "../api/home";

vi.mock("../api/home", () => ({
  getFeed: vi.fn(),
  getTrendingAlbums: vi.fn(),
  getTrendingArtists: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ username: "alice", profile: null, isLoading: false }),
}));
vi.mock("../context/FeaturesContext", () => ({
  useFeatures: () => ({ spotifyComparison: true }),
}));

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.mocked(getTrendingAlbums).mockResolvedValue([]);
    vi.mocked(getTrendingArtists).mockResolvedValue([]);
    vi.mocked(getFeed).mockResolvedValue({ items: [], next_cursor: null });
  });

  // On phones the two trending boxes merge into one tabbed box so the activity
  // feed starts on the first screen. Both boxes stay mounted at every width —
  // only the tab bar and the `paneOff` class are phone-only (CSS) — so this test
  // covers the tab state rather than what jsdom can't evaluate (media queries).
  // The tab bar lives in the visible box's own header, so exactly one copy of it
  // exists at a time even though both boxes are mounted.
  it("offers Albums/Artists trending tabs and moves the selection", async () => {
    renderHome();

    const albums = screen.getByRole("button", { name: "Albums" });
    const artists = screen.getByRole("button", { name: "Artists" });

    expect(albums).toHaveAttribute("aria-pressed", "true");
    expect(artists).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(artists);

    expect(screen.getByRole("button", { name: "Albums" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Artists" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Both lists stay in the DOM — desktop shows them stacked in the rail. Each
    // heading carries the desktop caption and the phone one ("What's Trending");
    // CSS shows exactly one, but jsdom applies none, hence the loose match.
    expect(
      await screen.findByRole("heading", { name: /Trending Albums/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Trending Artists/ })).toBeInTheDocument();
  });
});
