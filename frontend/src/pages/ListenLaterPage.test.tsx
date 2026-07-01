import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListenLaterPage } from "./ListenLaterPage";
import { getListenLater, listMyInvites } from "../api/invites";
import { deleteRating } from "../api/ratings";

vi.mock("../api/invites", () => ({
  getListenLater: vi.fn(),
  listMyInvites: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
  cancelInvite: vi.fn(),
}));
vi.mock("../api/ratings", () => ({ deleteRating: vi.fn() }));

const ENTRY = {
  album: {
    id: 1,
    spotify_id: "alb1",
    title: "Test Album",
    artist: "The Artist",
    artist_spotify_id: "art1",
    release_date: "2024-01-01",
    total_songs: 10,
    album_art_url: null,
    tracks: [],
  },
  rating: {
    id: 7,
    username: "me",
    album_id: 1,
    score: null,
    top_track_indices: null,
    status: "draft" as const,
    started_at: "",
    completed_at: null,
    last_edited_at: "",
    notes: [],
  },
  participants: [],
};

describe("ListenLaterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyInvites).mockResolvedValue({ incoming: [], outgoing: [] });
    vi.mocked(deleteRating).mockResolvedValue(undefined);
  });

  it("removes a draft only after confirmation", async () => {
    // First load shows the entry; after removal the list is empty.
    vi.mocked(getListenLater).mockResolvedValueOnce([ENTRY] as never).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Test Album")).toBeInTheDocument();

    // Clicking Remove asks for confirmation — nothing deleted yet.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/remove from listen later\?/i)).toBeInTheDocument();
    expect(deleteRating).not.toHaveBeenCalled();

    // Confirming deletes the draft rating and refreshes the list.
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(deleteRating).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText("Test Album")).not.toBeInTheDocument());
  });
});
