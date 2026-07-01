import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumInfoPage } from "./AlbumInfoPage";
import { getAlbum, getAlbumStats } from "../api/albums";
import { getMyRatingForAlbum } from "../api/ratings";

vi.mock("../api/albums", () => ({ getAlbum: vi.fn(), getAlbumStats: vi.fn() }));
vi.mock("../api/ratings", () => ({
  getMyRatingForAlbum: vi.fn(),
  createRating: vi.fn(),
}));
vi.mock("../api/invites", () => ({ createInvite: vi.fn() }));
vi.mock("../api/friendships", () => ({ listFriendships: vi.fn().mockResolvedValue({ accepted: [] }) }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ username: "me" }) }));
// The comments section has its own tests; stub it here to isolate the page.
vi.mock("../components/CommentsSection", () => ({ CommentsSection: () => null }));

const ALBUM = {
  id: 1,
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 10,
  album_art_url: "https://x/art.jpg",
  tracks: [
    { index: 1, name: "Track 1", spotify_url: null, duration_ms: 180000 },
    { index: 2, name: "Track 2", spotify_url: null, duration_ms: 180000 },
    { index: 3, name: "Track 3", spotify_url: null, duration_ms: 180000 },
  ],
};

const PUBLISHED_RATING = {
  id: 9,
  username: "me",
  album_id: 1,
  score: 9.0,
  top_track_indices: [1, 3],
  status: "published" as const,
  started_at: "",
  completed_at: "",
  last_edited_at: "",
  notes: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/albums/alb1"]}>
      <Routes>
        <Route path="/albums/:spotifyId" element={<AlbumInfoPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AlbumInfoPage", () => {
  beforeEach(() => {
    vi.mocked(getAlbum).mockResolvedValue(ALBUM);
    vi.mocked(getAlbumStats).mockResolvedValue({ mean_score: 7.8, num_raters: 98 });
    vi.mocked(getMyRatingForAlbum).mockResolvedValue(PUBLISHED_RATING);
  });

  it("shows Spotify links, the artist-page button, stats and our score", async () => {
    renderPage();

    // Title links to the Spotify album.
    const titleLink = await screen.findByRole("link", { name: "Test Album" });
    expect(titleLink).toHaveAttribute("href", "https://open.spotify.com/album/alb1");

    // Artist name links to the Spotify artist.
    expect(screen.getByRole("link", { name: "The Artist" })).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/art1"
    );

    // Go to artist page → Albumania artist route.
    expect(screen.getByRole("link", { name: /go to artist page/i })).toHaveAttribute(
      "href",
      "/artists/art1"
    );

    // Global mean (stars + value + count) and our score.
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("(98)")).toBeInTheDocument();
    expect(screen.getByText(/your score/i)).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("keeps the track list collapsed until the toggle is clicked", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    // Collapsed by default → tracks not rendered.
    expect(screen.queryByText("Track 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tracks \(3\)/i }));
    expect(screen.getByText("Track 1")).toBeInTheDocument();
  });

  it("marks the top-5 tracks with their rank position", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });
    fireEvent.click(screen.getByRole("button", { name: /tracks \(3\)/i }));

    // top_track_indices [1, 3] → track 1 is rank #1, track 3 is rank #2.
    const track1Row = screen.getByText("Track 1").closest("li") as HTMLElement;
    expect(within(track1Row).getByText("#1")).toBeInTheDocument();
    const track3Row = screen.getByText("Track 3").closest("li") as HTMLElement;
    expect(within(track3Row).getByText("#2")).toBeInTheDocument();
    const track2Row = screen.getByText("Track 2").closest("li") as HTMLElement;
    expect(within(track2Row).queryByText(/^#\d+$/)).toBeNull();
  });

  it("omits the 'Average' label when the album has no ratings", async () => {
    vi.mocked(getAlbumStats).mockResolvedValue({ mean_score: null, num_raters: 0 });
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    expect(screen.getByText("No ratings yet")).toBeInTheDocument();
    expect(screen.queryByText("Average")).not.toBeInTheDocument();
  });
});
