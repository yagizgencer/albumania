import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentItem } from "./CommentItem";
import { reactToComment } from "../api/comments";
import type { Comment } from "../api/comments";

vi.mock("emoji-picker-react", () => ({ default: () => null, Theme: { AUTO: "auto" } }));
vi.mock("../api/comments", () => ({
  reactToComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

const BASE: Comment = {
  id: 1,
  text: "great record",
  visibility: "public",
  author: { username: "alice", display_name: "Alice", picture_url: null },
  is_mine: false,
  created_at: "2024-01-01T00:00:00Z",
  edited_at: null,
  likes: 0,
  dislikes: 0,
  viewer_reaction: null,
};

function renderItem(overrides: Partial<Comment> = {}, onUpdated = vi.fn(), onDeleted = vi.fn()) {
  render(
    <MemoryRouter>
      <CommentItem comment={{ ...BASE, ...overrides }} onUpdated={onUpdated} onDeleted={onDeleted} />
    </MemoryRouter>
  );
  return { onUpdated, onDeleted };
}

describe("CommentItem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a clickable author when identity is visible", () => {
    renderItem();
    const link = screen.getByRole("link", { name: /alice/i });
    expect(link).toHaveAttribute("href", "/profile/alice");
  });

  it("shows Anonymous with no link when identity is masked", () => {
    renderItem({ author: null });
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks edited comments", () => {
    renderItem({ edited_at: "2024-02-01T00:00:00Z" });
    expect(screen.getByText(/edited/)).toBeInTheDocument();
  });

  it("shows separate like and dislike counts (hidden when zero)", () => {
    renderItem({ likes: 5, dislikes: 2 });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // No net/negative number is ever shown.
    expect(screen.queryByText("-3")).not.toBeInTheDocument();
  });

  it("sends a reaction and reports the update", async () => {
    vi.mocked(reactToComment).mockResolvedValue({ likes: 1, dislikes: 0, viewer_reaction: "up" });
    const { onUpdated } = renderItem();
    fireEvent.click(screen.getByRole("button", { name: /thumbs up/i }));
    await waitFor(() => {
      expect(reactToComment).toHaveBeenCalledWith(1, "up");
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ likes: 1, dislikes: 0, viewer_reaction: "up" })
      );
    });
  });

  it("exposes edit/delete via the actions menu only for the viewer's own comment", () => {
    renderItem({ is_mine: true });
    // Edit/Delete live behind a "…" menu, not inline.
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Comment actions" }));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides the actions menu for comments that aren't the viewer's", () => {
    renderItem({ is_mine: false });
    expect(screen.queryByRole("button", { name: "Comment actions" })).not.toBeInTheDocument();
  });
});
