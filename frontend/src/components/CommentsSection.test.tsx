import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentsSection } from "./CommentsSection";
import { createComment, listComments } from "../api/comments";
import type { Comment } from "../api/comments";

vi.mock("emoji-picker-react", () => ({ default: () => null, Theme: { AUTO: "auto" } }));
vi.mock("../api/comments", () => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
  reactToComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

const COMMENT: Comment = {
  id: 1,
  text: "great record",
  visibility: "public",
  author: { username: "alice", display_name: "Alice", picture_url: null },
  is_mine: false,
  created_at: "2024-01-01T00:00:00Z",
  edited_at: null,
  likes: 3,
  dislikes: 0,
  viewer_reaction: null,
};

function renderSection() {
  render(
    <MemoryRouter>
      <CommentsSection spotifyId="sid1" />
    </MemoryRouter>
  );
}

describe("CommentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listComments).mockResolvedValue([COMMENT]);
    vi.mocked(createComment).mockResolvedValue(COMMENT);
  });

  it("lists comments with a count", async () => {
    renderSection();
    expect(await screen.findByText("Comments (1)")).toBeInTheDocument();
    expect(screen.getByText("great record")).toBeInTheDocument();
    expect(listComments).toHaveBeenCalledWith("sid1", "recent", "desc");
  });

  it("re-queries when the sort changes", async () => {
    renderSection();
    await screen.findByText("Comments (1)");
    // Custom dropdown: open it, then pick "Most liked".
    fireEvent.click(screen.getByRole("button", { name: /sort comments by/i }));
    fireEvent.click(screen.getByRole("button", { name: /most liked/i }));
    await waitFor(() => expect(listComments).toHaveBeenCalledWith("sid1", "score", "desc"));
  });

  it("posts a new comment and refreshes", async () => {
    renderSection();
    await screen.findByText("Comments (1)");
    fireEvent.change(screen.getByLabelText("Comment text"), { target: { value: "nice!" } });
    fireEvent.click(screen.getByRole("button", { name: /post comment/i }));
    await waitFor(() => {
      expect(createComment).toHaveBeenCalledWith("sid1", { text: "nice!", visibility: "public" });
      // reloaded after posting
      expect(listComments).toHaveBeenCalledTimes(2);
    });
  });
});
