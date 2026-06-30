import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AlbumCard } from "./AlbumCard";

function renderCard(props: Partial<Parameters<typeof AlbumCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AlbumCard
        spotifyId="alb1"
        title="Test Album"
        artist="The Artist"
        albumArtUrl={null}
        meanScore={7.8}
        numRaters={98}
        status="published"
        {...props}
      />
    </MemoryRouter>
  );
}

describe("AlbumCard", () => {
  it("links to the album page and shows the mean rating", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/albums/alb1");
    expect(screen.getByText("7.8 (98)")).toBeInTheDocument();
  });

  it("shows a dash when there are no raters", () => {
    renderCard({ status: "none", meanScore: null, numRaters: 0 });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the right badge per status", () => {
    const { rerender } = renderCard({ status: "published" });
    expect(screen.getByLabelText("Rated")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AlbumCard
          spotifyId="alb1"
          title="t"
          artist="a"
          albumArtUrl={null}
          meanScore={null}
          numRaters={0}
          status="draft"
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("In Listen Later")).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AlbumCard
          spotifyId="alb1"
          title="t"
          artist="a"
          albumArtUrl={null}
          meanScore={null}
          numRaters={0}
          status="none"
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Not in your library")).toBeInTheDocument();
  });
});
