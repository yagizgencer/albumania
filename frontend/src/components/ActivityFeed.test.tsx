import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityFeed } from "./ActivityFeed";
import { getFeed, type FeedItem } from "../api/home";

vi.mock("../api/home", () => ({ getFeed: vi.fn() }));

const ALBUM = { spotify_id: "alb1", title: "Album One", artist: "The Artist", album_art_url: null };
const bob = { username: "bob", display_name: "Bob", picture_url: null };
const me = { username: "me", display_name: "Me", picture_url: null };

const ITEMS: FeedItem[] = [
  { id: "comment-1", type: "friend_commented", created_at: "2025-01-06T00:00:00Z", actor: bob, album: ALBUM, score: null, excerpt: "loved this" },
  { id: "rating-1", type: "you_rated", created_at: "2025-01-05T00:00:00Z", actor: me, album: ALBUM, score: 8, excerpt: null },
  { id: "friend-1", type: "new_friend", created_at: "2025-01-01T00:00:00Z", actor: bob, album: null, score: null, excerpt: null },
];

function renderFeed() {
  render(
    <MemoryRouter>
      <ActivityFeed />
    </MemoryRouter>
  );
}

describe("ActivityFeed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders event types with links and excerpts", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: ITEMS, next_before: null });
    renderFeed();

    expect(await screen.findByText(/you rated/i)).toBeInTheDocument();
    expect(screen.getByText(/loved this/)).toBeInTheDocument();
    expect(screen.getByText(/are now friends/i)).toBeInTheDocument();

    // Album links → /albums/:id ; actor links → /profile/:username.
    expect(screen.getAllByRole("link", { name: "Album One" })[0]).toHaveAttribute("href", "/albums/alb1");
    expect(screen.getAllByRole("link", { name: "Bob" })[0]).toHaveAttribute("href", "/profile/bob");
    // your own rating shows the score
    expect(screen.getByText("8.0")).toBeInTheDocument();
  });

  it("loads older activity when the cursor button is clicked", async () => {
    vi.mocked(getFeed)
      .mockResolvedValueOnce({ items: [ITEMS[0]], next_before: "2025-01-06T00:00:00Z" })
      .mockResolvedValueOnce({ items: [ITEMS[2]], next_before: null });
    renderFeed();

    await screen.findByText(/loved this/);
    fireEvent.click(screen.getByRole("button", { name: /load older activity/i }));

    await waitFor(() => {
      // All categories selected → no `types` narrowing.
      expect(getFeed).toHaveBeenCalledWith("2025-01-06T00:00:00Z", undefined, undefined);
      expect(screen.getByText(/are now friends/i)).toBeInTheDocument();
    });
  });

  it("shows an empty state when there is no activity", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: [], next_before: null });
    renderFeed();
    expect(await screen.findByText(/no activity yet/i)).toBeInTheDocument();
  });

  it("refetches with a narrowed type list when a category is toggled off", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: ITEMS, next_before: null });
    renderFeed();
    await screen.findByText(/you rated/i);

    fireEvent.click(screen.getByRole("button", { name: "Friends" }));

    await waitFor(() => {
      expect(getFeed).toHaveBeenLastCalledWith(null, undefined, ["ratings", "comments"]);
    });
  });

  it("prompts to pick a type when every category is deselected", async () => {
    vi.mocked(getFeed).mockResolvedValue({ items: ITEMS, next_before: null });
    renderFeed();
    await screen.findByText(/you rated/i);

    fireEvent.click(screen.getByRole("button", { name: "Ratings" }));
    fireEvent.click(screen.getByRole("button", { name: "Comments" }));
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));

    expect(await screen.findByText(/pick at least one activity type/i)).toBeInTheDocument();
  });
});
