import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ArtistPage } from "./ArtistPage";
import { getArtist, type ArtistDetail } from "../api/artists";

vi.mock("../api/artists", () => ({ getArtist: vi.fn() }));

const DETAIL: ArtistDetail = {
  artist: { spotify_id: "art1", name: "The Artist", image_url: null },
  albums: [
    {
      spotify_id: "rated",
      title: "Rated Album",
      artist: "The Artist",
      artist_spotify_id: "art1",
      release_date: "2024-01-01",
      total_songs: 10,
      album_art_url: null,
      status: "published",
      mean_score: 7.8,
      num_raters: 98,
    },
    {
      spotify_id: "draft",
      title: "Draft Album",
      artist: "The Artist",
      artist_spotify_id: "art1",
      release_date: "2024-01-01",
      total_songs: 10,
      album_art_url: null,
      status: "draft",
      mean_score: null,
      num_raters: 0,
    },
    {
      spotify_id: "none",
      title: "Unrated Album",
      artist: "The Artist",
      artist_spotify_id: "art1",
      release_date: "2024-01-01",
      total_songs: 10,
      album_art_url: null,
      status: "none",
      mean_score: null,
      num_raters: 0,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/artists/art1"]}>
      <Routes>
        <Route path="/artists/:artistId" element={<ArtistPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ArtistPage", () => {
  it("renders the artist header and a card per album with the right badge", async () => {
    vi.mocked(getArtist).mockResolvedValue(DETAIL);
    renderPage();

    expect(await screen.findByRole("heading", { name: /The Artist/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open on spotify/i })).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/art1"
    );

    expect(screen.getByLabelText("Rated")).toBeInTheDocument();
    expect(screen.getByLabelText("In Listen & Rate")).toBeInTheDocument();
    expect(screen.getByLabelText("Add to Listen & Rate")).toBeInTheDocument();
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("(98)")).toBeInTheDocument();
  });
});
