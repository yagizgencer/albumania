import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ListenLaterPage } from "./ListenLaterPage";
import {
  getListenLater,
  getListenLaterCompleted,
  listMyInvites,
  removeFromListenLater,
} from "../api/invites";
import { deleteRating } from "../api/ratings";

vi.mock("../api/invites", () => ({
  getListenLater: vi.fn(),
  getListenLaterCompleted: vi.fn(),
  listMyInvites: vi.fn(),
  removeFromListenLater: vi.fn(),
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

const COMPLETED_ENTRY = {
  ...ENTRY,
  rating: { ...ENTRY.rating, score: 8, status: "published" as const },
  participants: [
    {
      username: "bob",
      picture_url: null,
      direction: "outgoing" as const,
      invite_status: "completed" as const,
      they_published: true,
    },
  ],
};

describe("ListenLaterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMyInvites).mockResolvedValue({ incoming: [], outgoing: [] });
    vi.mocked(removeFromListenLater).mockResolvedValue(undefined);
    vi.mocked(getListenLaterCompleted).mockResolvedValue([]);
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
    // The rating action is always just "Rate" (no start/continue distinction).
    expect(screen.getByRole("link", { name: "Rate" })).toHaveAttribute(
      "href",
      "/albums/alb1/rate"
    );

    // Clicking Remove asks for confirmation — nothing removed yet.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText(/remove from listen & rate\?/i)).toBeInTheDocument();
    expect(removeFromListenLater).not.toHaveBeenCalled();

    // Confirming removes the album (by id) and refreshes the list.
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(removeFromListenLater).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Test Album")).not.toBeInTheDocument());
  });

  it("links a participant's username to their profile", async () => {
    vi.mocked(getListenLater).mockResolvedValue([
      {
        ...ENTRY,
        participants: [
          {
            username: "bob",
            picture_url: null,
            direction: "incoming",
            invite_status: "accepted",
            they_published: false,
          },
        ],
      },
    ] as never);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    // Each listening-with avatar is itself a link to that friend's profile.
    const link = await screen.findByRole("link", { name: /bob/i });
    expect(link).toHaveAttribute("href", "/profile/bob");
  });

  it("shows Remove for an accepted-invite entry that has no draft yet", async () => {
    // Accepted invite, no draft rating → the row exists purely from the invite.
    vi.mocked(getListenLater)
      .mockResolvedValueOnce([
        {
          ...ENTRY,
          rating: null,
          participants: [
            {
              username: "bob",
              picture_url: null,
              direction: "outgoing",
              invite_status: "accepted",
              they_published: false,
            },
          ],
        },
      ] as never)
      .mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    await screen.findByText("Test Album");
    // Remove is available even with no draft, and removes by album id.
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(removeFromListenLater).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText("Test Album")).not.toBeInTheDocument());
  });

  it("links the album title and artist to their pages", async () => {
    vi.mocked(getListenLater).mockResolvedValue([ENTRY] as never);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    const albumLink = await screen.findByRole("link", { name: "Test Album" });
    expect(albumLink).toHaveAttribute("href", "/albums/alb1");
    const artistLink = screen.getByRole("link", { name: "The Artist" });
    expect(artistLink).toHaveAttribute("href", "/artists/art1");
  });

  it("shows completed ratings with an Edit link and score, but no participants", async () => {
    vi.mocked(getListenLater).mockResolvedValue([]);
    vi.mocked(getListenLaterCompleted).mockResolvedValue([COMPLETED_ENTRY] as never);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    // Switch to the Completed tab.
    fireEvent.click(await screen.findByRole("button", { name: /completed/i }));

    // The published entry links into the rating editor (edit mode), not "Rate".
    const editLink = await screen.findByRole("link", { name: "Edit rating" });
    expect(editLink).toHaveAttribute("href", "/albums/alb1/rate");
    expect(screen.queryByRole("link", { name: "Rate" })).not.toBeInTheDocument();
    // The score sticker shows; the "listened with" stack is intentionally absent.
    expect(screen.getByText("8.0")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bob/i })).not.toBeInTheDocument();
  });

  it("deletes a completed rating after confirmation", async () => {
    vi.mocked(getListenLater).mockResolvedValue([]);
    vi.mocked(getListenLaterCompleted)
      .mockResolvedValueOnce([COMPLETED_ENTRY] as never)
      .mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ListenLaterPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: /completed/i }));
    await screen.findByRole("link", { name: "Edit rating" });

    // Confirm-gated, and it deletes the *rating* (by id 7), not the queue entry.
    fireEvent.click(screen.getByRole("button", { name: "Delete rating" }));
    expect(screen.getByText(/delete this rating\?/i)).toBeInTheDocument();
    expect(deleteRating).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(deleteRating).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByText("Test Album")).not.toBeInTheDocument());
  });
});
