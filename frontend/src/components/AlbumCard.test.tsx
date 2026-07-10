import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumCard } from "./AlbumCard";
import { getAlbum } from "../api/albums";
import { createRating } from "../api/ratings";

vi.mock("../api/albums", () => ({ getAlbum: vi.fn() }));
vi.mock("../api/ratings", () => ({ createRating: vi.fn() }));

function renderCard(props: Partial<Parameters<typeof AlbumCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AlbumCard
        spotifyId="alb1"
        title="Test Album"
        albumArtUrl={null}
        releaseDate="2019-05-17"
        totalSongs={10}
        meanScore={7.8}
        numRaters={98}
        status="published"
        {...props}
      />
    </MemoryRouter>
  );
}

describe("AlbumCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAlbum).mockResolvedValue({ id: 42 } as never);
    vi.mocked(createRating).mockResolvedValue({} as never);
  });

  it("links to the album page and shows the mean rating", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/albums/alb1");
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("(98)")).toBeInTheDocument();
  });

  it("shows the release-date chip instead of the artist name", () => {
    renderCard();
    expect(screen.getByText("17.05.2019")).toBeInTheDocument();
    expect(screen.queryByText("The Artist")).not.toBeInTheDocument();
  });

  it("shows a dash when there are no raters", () => {
    renderCard({ status: "none", meanScore: null, numRaters: 0 });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the right badge per status", () => {
    renderCard({ status: "published" });
    expect(screen.getByLabelText("Rated")).toBeInTheDocument();

    renderCard({ status: "draft", meanScore: null, numRaters: 0 });
    expect(screen.getByLabelText("In Listen & Rate")).toBeInTheDocument();

    renderCard({ status: "none", meanScore: null, numRaters: 0 });
    expect(screen.getByLabelText("Add to Listen & Rate")).toBeInTheDocument();
  });

  it("adds the album to Listen Later when the + badge is clicked", async () => {
    renderCard({ status: "none", meanScore: null, numRaters: 0 });
    fireEvent.click(screen.getByLabelText("Add to Listen & Rate"));

    await waitFor(() => {
      expect(getAlbum).toHaveBeenCalledWith("alb1");
      expect(createRating).toHaveBeenCalledWith(42);
      // Badge flips to the Listen Later (draft) state.
      expect(screen.getByLabelText("In Listen & Rate")).toBeInTheDocument();
    });
  });

  it("disables adding for albums outside the 5–25 track range", () => {
    renderCard({ status: "none", totalSongs: 30, meanScore: null, numRaters: 0 });
    expect(screen.queryByLabelText("Add to Listen & Rate")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/5–25 tracks/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/5–25 tracks/));
    expect(createRating).not.toHaveBeenCalled();
  });
});
