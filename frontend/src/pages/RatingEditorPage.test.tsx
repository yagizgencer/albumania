import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useLocation,
  Link,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RatingEditorPage } from "./RatingEditorPage";
import { UnsavedChangesProvider } from "../lib/unsavedChanges";
import { getAlbum } from "../api/albums";
import {
  createRating,
  getMyRatingForAlbum,
  patchRating,
  publishRating,
} from "../api/ratings";

vi.mock("../api/albums", () => ({ getAlbum: vi.fn() }));
vi.mock("../api/ratings", () => ({
  getMyRatingForAlbum: vi.fn(),
  createRating: vi.fn(),
  patchRating: vi.fn(),
  publishRating: vi.fn(),
  deleteRating: vi.fn(),
}));
vi.mock("../api/comments", () => ({ createComment: vi.fn() }));
// The publish-box comment composer isn't under test; stub to a plain textarea.
vi.mock("../components/CommentComposer", () => ({
  CommentComposer: () => null,
}));

const ALBUM = {
  id: 1,
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 5,
  album_art_url: null,
  tracks: [1, 2, 3, 4, 5].map((i) => ({
    index: i,
    name: `Track ${i}`,
    spotify_url: null,
    duration_ms: 180000,
  })),
};

// A ready-to-publish draft: score set + all 5 top tracks filled.
const READY_DRAFT = {
  id: 7,
  username: "me",
  album_id: 1,
  score: 8,
  top_track_indices: [1, 2, 3, 4, 5],
  status: "draft" as const,
  started_at: "",
  completed_at: null,
  last_edited_at: "",
  notes: [],
};

function Probe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

// useBlocker requires a data router, so tests use createMemoryRouter. A layout
// route renders an always-present "leave" link to exercise in-app navigation.
function renderEditor(state?: unknown) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <UnsavedChangesProvider>
            <Link to="/somewhere">leave</Link>
            <Outlet />
          </UnsavedChangesProvider>
        ),
        children: [
          { path: "/albums/:spotifyId/rate", element: <RatingEditorPage /> },
          { path: "/albums/:spotifyId", element: <Probe /> },
          { path: "/listen-later", element: <Probe /> },
          { path: "/somewhere", element: <Probe /> },
        ],
      },
    ],
    { initialEntries: [{ pathname: "/albums/alb1/rate", state }] }
  );
  return render(<RouterProvider router={router} />);
}

describe("RatingEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAlbum).mockResolvedValue(ALBUM as never);
    vi.mocked(getMyRatingForAlbum).mockResolvedValue(READY_DRAFT as never);
    vi.mocked(patchRating).mockResolvedValue(READY_DRAFT as never);
    vi.mocked(publishRating).mockResolvedValue({
      ...READY_DRAFT,
      status: "published",
    } as never);
    vi.mocked(createRating).mockResolvedValue(READY_DRAFT as never);
  });

  it("calls publishRating when Publish is clicked", async () => {
    renderEditor();
    await screen.findByRole("button", { name: /publish/i });

    fireEvent.click(screen.getByRole("button", { name: /publish/i }));
    await waitFor(() => expect(publishRating).toHaveBeenCalledWith(7));
    // (The subsequent redirect to the origin is exercised manually / by App
    // smoke tests — jsdom's fetch primitives can't complete a data-router nav.)
  });

  it("blocks navigation with the unsaved-changes modal after an edit", async () => {
    renderEditor();
    await screen.findByRole("button", { name: /publish/i });

    // Edit the score → the rating differs from its saved state.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });

    // Navigating away is intercepted by the unsaved-changes modal.
    fireEvent.click(screen.getByRole("link", { name: "leave" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /unsaved changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save & quit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quit without saving/i })).toBeInTheDocument();

    // Cancel dismisses it and keeps us on the editor.
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("does not block navigation when there are no unsaved edits", async () => {
    renderEditor();
    await screen.findByRole("button", { name: /publish/i });

    // No edits → clicking away is NOT intercepted (no modal appears).
    fireEvent.click(screen.getByRole("link", { name: "leave" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });
});
