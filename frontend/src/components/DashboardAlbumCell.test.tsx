import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardAlbumCell } from "./DashboardAlbumCell";
import type { DashboardAlbum } from "../api/dashboard";

const ALBUM: DashboardAlbum = {
  id: 1,
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 10,
  album_art_url: "https://x/art.jpg",
};

describe("DashboardAlbumCell", () => {
  it("renders the album title and artist as plain (non-clickable) text", () => {
    render(<DashboardAlbumCell album={ALBUM} />);
    expect(screen.getByText("Test Album")).toBeInTheDocument();
    expect(screen.getByText("The Artist")).toBeInTheDocument();
    // The whole row is the click target, so the cell has no inner links/buttons.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
