import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

function renderCell(album: DashboardAlbum, onRowClick = vi.fn()) {
  render(
    <MemoryRouter>
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <DashboardAlbumCell album={album} />
            </td>
          </tr>
        </tbody>
      </table>
    </MemoryRouter>
  );
  return onRowClick;
}

describe("DashboardAlbumCell", () => {
  it("links the title/artist to Spotify and the buttons to internal pages", () => {
    renderCell(ALBUM);

    expect(screen.getByRole("link", { name: "Test Album" })).toHaveAttribute(
      "href",
      "https://open.spotify.com/album/alb1"
    );
    expect(screen.getByRole("link", { name: "The Artist" })).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/art1"
    );
    expect(screen.getByRole("link", { name: "Album" })).toHaveAttribute("href", "/albums/alb1");
    expect(screen.getByRole("link", { name: "Artist" })).toHaveAttribute("href", "/artists/art1");
  });

  it("does not trigger the row click when a button is clicked", () => {
    const onRowClick = renderCell(ALBUM);
    fireEvent.click(screen.getByRole("link", { name: "Album" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("omits the Artist button and artist link when there is no artist id", () => {
    renderCell({ ...ALBUM, artist_spotify_id: null });
    expect(screen.queryByRole("link", { name: "Artist" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "The Artist" })).not.toBeInTheDocument();
    expect(screen.getByText("The Artist")).toBeInTheDocument();
  });
});
