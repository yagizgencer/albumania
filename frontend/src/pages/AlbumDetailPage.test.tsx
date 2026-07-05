import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumDetailPage } from "./AlbumDetailPage";
import { getAlbum } from "../api/albums";
import { getDashboard } from "../api/dashboard";

vi.mock("../api/albums", () => ({ getAlbum: vi.fn() }));
vi.mock("../api/dashboard", () => ({ getDashboard: vi.fn() }));
vi.mock("../api/ratings", () => ({
  getMyRatingForAlbum: vi.fn(),
  deleteRating: vi.fn(),
}));

// The current user is "me".
let currentUser = "me";
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ username: currentUser }),
}));

const ALBUM = {
  id: 1,
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 10,
  album_art_url: null,
  tracks: [{ index: 1, name: "Track 1", spotify_url: null, duration_ms: 180000 }],
};

const ENTRY = {
  album: ALBUM,
  score: 8.5,
  top_track_indices: [1],
  spotify_top5_indices: [1],
  similarity_user_vs_spotify: 0.9,
  completed_at: "2024-02-01",
};

function renderAt(username: string) {
  return render(
    <MemoryRouter initialEntries={[`/users/${username}/albums/alb1`]}>
      <Routes>
        <Route path="/users/:username/albums/:spotifyId" element={<AlbumDetailPage />} />
        <Route path="/profile/:username" element={<div>profile</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AlbumDetailPage — remove rating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = "me";
    vi.mocked(getAlbum).mockResolvedValue(ALBUM as never);
    vi.mocked(getDashboard).mockResolvedValue({ username: "me", entries: [ENTRY] } as never);
  });

  it("shows Remove rating on my own album detail", async () => {
    renderAt("me");
    expect(await screen.findByRole("link", { name: /go to album page/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove rating/i })).toBeInTheDocument();
  });

  it("hides Remove rating on someone else's album detail", async () => {
    currentUser = "me";
    vi.mocked(getDashboard).mockResolvedValue({ username: "bob", entries: [ENTRY] } as never);
    renderAt("bob");
    await screen.findByRole("link", { name: /go to album page/i });
    expect(screen.queryByRole("button", { name: /remove rating/i })).not.toBeInTheDocument();
  });
});
