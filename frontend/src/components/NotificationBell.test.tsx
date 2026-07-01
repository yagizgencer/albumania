import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationBell } from "./NotificationBell";
import { listNotifications } from "../api/notifications";

vi.mock("../api/notifications", () => ({ listNotifications: vi.fn() }));
vi.mock("../context/NotificationsContext", () => ({
  useNotifications: () => ({
    summary: { bell: 1, listen_invites: 0, friend_requests: 0 },
    markSeen: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const LIKE_ITEM = {
  id: 1,
  type: "comment_liked" as const,
  actor_username: null,
  actor_picture_url: null,
  friendship_id: null,
  invite_id: null,
  album: { spotify_id: "alb1", title: "Test Album", artist: "The Artist" },
  read: false,
  created_at: "2024-01-01T00:00:00Z",
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listNotifications).mockResolvedValue([LIKE_ITEM] as never);
  });

  it("shows an anonymous comment-like notification linking to the album", async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const label = await screen.findByText("Someone liked your comment");
    expect(label).toBeInTheDocument();
    const link = label.closest("a") as HTMLElement;
    expect(link).toHaveAttribute("href", "/albums/alb1");
    // Album context line names the album; no actor username is revealed.
    expect(screen.getByText(/Test Album · The Artist/)).toBeInTheDocument();
  });
});
