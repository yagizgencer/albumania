import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumInfoPage } from "./AlbumInfoPage";
import { UnsavedChangesProvider } from "../lib/unsavedChanges";
import { getAlbum, getAlbumFriendRatings, getAlbumStats } from "../api/albums";
import { deleteRating, getMyRatingForAlbum } from "../api/ratings";
import { getListenLater, listMyInvites } from "../api/invites";
import { listFriendships } from "../api/friendships";

vi.mock("../api/albums", () => ({
  getAlbum: vi.fn(),
  getAlbumStats: vi.fn(),
  getAlbumFriendRatings: vi.fn(),
}));
vi.mock("../api/ratings", () => ({
  getMyRatingForAlbum: vi.fn(),
  createRating: vi.fn(),
  deleteRating: vi.fn(),
}));
vi.mock("../api/invites", () => ({
  createInvite: vi.fn(),
  listMyInvites: vi.fn().mockResolvedValue({ incoming: [], outgoing: [] }),
  getListenLater: vi.fn().mockResolvedValue([]),
}));
vi.mock("../api/friendships", () => ({ listFriendships: vi.fn().mockResolvedValue({ accepted: [] }) }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ username: "me" }) }));

// Spy on navigation so the friend-pick tests can assert the target path + state
// without a *completed* data-router navigation (jsdom can't finish those).
const navSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navSpy,
}));
// The comments section has its own tests; stub it here to isolate the page.
vi.mock("../components/CommentsSection", () => ({ CommentsSection: () => null }));

const ALBUM = {
  id: 1,
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 10,
  album_art_url: "https://x/art.jpg",
  tracks: [
    { index: 1, name: "Track 1", spotify_url: null, duration_ms: 180000 },
    { index: 2, name: "Track 2", spotify_url: null, duration_ms: 180000 },
    { index: 3, name: "Track 3", spotify_url: null, duration_ms: 180000 },
  ],
};

const PUBLISHED_RATING = {
  id: 9,
  username: "me",
  album_id: 1,
  score: 9.0,
  top_track_indices: [1, 3],
  status: "published" as const,
  started_at: "",
  completed_at: "",
  last_edited_at: "",
  notes: [],
};

// Renders wherever a friend pick navigates so we can assert the path + state.
function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </div>
  );
}

function renderPage() {
  // A data router (createMemoryRouter) is required because AlbumInfoPage's
  // unsaved-changes guard uses useBlocker; wrap in the provider it registers into.
  const router = createMemoryRouter(
    [
      { path: "/albums/:spotifyId", element: <AlbumInfoPage /> },
      { path: "/friendships/:friendshipId/albums/:spotifyId", element: <LocationProbe /> },
      { path: "/users/:username/albums/:spotifyId", element: <LocationProbe /> },
    ],
    { initialEntries: ["/albums/alb1"] }
  );
  return render(
    <UnsavedChangesProvider>
      <RouterProvider router={router} />
    </UnsavedChangesProvider>
  );
}

describe("AlbumInfoPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAlbum).mockResolvedValue(ALBUM);
    vi.mocked(getAlbumStats).mockResolvedValue({ mean_score: 7.8, num_raters: 98 });
    vi.mocked(getMyRatingForAlbum).mockResolvedValue(PUBLISHED_RATING);
    vi.mocked(getAlbumFriendRatings).mockResolvedValue([]);
    // Reset invite state to "none" each test — clearAllMocks keeps per-test
    // mockResolvedValue overrides, which would otherwise leak between tests.
    vi.mocked(listMyInvites).mockResolvedValue({ incoming: [], outgoing: [] });
    vi.mocked(getListenLater).mockResolvedValue([]);
    vi.mocked(listFriendships).mockResolvedValue({ accepted: [] });
  });

  it("shows Spotify links, the artist-page button, stats and our score", async () => {
    renderPage();

    // Title links to the Spotify album.
    const titleLink = await screen.findByRole("link", { name: "Test Album" });
    expect(titleLink).toHaveAttribute("href", "https://open.spotify.com/album/alb1");

    // Artist name links to the Spotify artist.
    expect(screen.getByRole("link", { name: "The Artist" })).toHaveAttribute(
      "href",
      "https://open.spotify.com/artist/art1"
    );

    // Go to artist page → Albumania artist route.
    expect(screen.getByRole("link", { name: /go to artist page/i })).toHaveAttribute(
      "href",
      "/artists/art1"
    );

    // Global mean (stars + value + count) and our score.
    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("(98)")).toBeInTheDocument();
    expect(screen.getByText(/your score/i)).toBeInTheDocument();
    expect(screen.getByText("9.0")).toBeInTheDocument();
  });

  it("keeps the track list collapsed until the toggle is clicked", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    // Collapsed by default → tracks not rendered.
    expect(screen.queryByText("Track 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tracks \(3\)/i }));
    expect(screen.getByText("Track 1")).toBeInTheDocument();
  });

  it("marks the top-5 tracks with their rank position", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });
    fireEvent.click(screen.getByRole("button", { name: /tracks \(3\)/i }));

    // top_track_indices [1, 3] → track 1 is rank #1, track 3 is rank #2.
    const track1Row = screen.getByText("Track 1").closest("li") as HTMLElement;
    expect(within(track1Row).getByText("#1")).toBeInTheDocument();
    const track3Row = screen.getByText("Track 3").closest("li") as HTMLElement;
    expect(within(track3Row).getByText("#2")).toBeInTheDocument();
    const track2Row = screen.getByText("Track 2").closest("li") as HTMLElement;
    expect(within(track2Row).queryByText(/^#\d+$/)).toBeNull();
  });

  it("omits the 'Average' label when the album has no ratings", async () => {
    vi.mocked(getAlbumStats).mockResolvedValue({ mean_score: null, num_raters: 0 });
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    expect(screen.getByText("No ratings yet")).toBeInTheDocument();
    expect(screen.queryByText("Average")).not.toBeInTheDocument();
  });

  it("removes the rating only after confirming", async () => {
    vi.mocked(deleteRating).mockResolvedValue(undefined);
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    // Published → Remove button shows; clicking asks to confirm, nothing deleted yet.
    fireEvent.click(screen.getByRole("button", { name: /remove rating/i }));
    expect(screen.getByText(/remove this rating\?/i)).toBeInTheDocument();
    expect(deleteRating).not.toHaveBeenCalled();

    // Confirm → deletes and the page returns to an unrated state.
    fireEvent.click(screen.getByRole("button", { name: /yes, remove/i }));
    await waitFor(() => expect(deleteRating).toHaveBeenCalledWith(9));
    expect(await screen.findByText(/your rating was removed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^rate$/i })).toBeInTheDocument();
  });

  it("shows no disabled 'Rated' button for a published album", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });
    // Only "Remove rating" should be present — the greyed "Rated" button is gone.
    expect(screen.queryByRole("button", { name: /^rated$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove rating/i })).toBeInTheDocument();
  });

  it("cancels removal without deleting", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.click(screen.getByRole("button", { name: /remove rating/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(deleteRating).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /remove rating/i })).toBeInTheDocument();
  });

  it("hides the remove control for an album the user hasn't rated", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    expect(screen.queryByRole("button", { name: /remove rating/i })).not.toBeInTheDocument();
  });

  it("offers Listen Later + Rate when unrated and no invite exists", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    expect(screen.getByRole("button", { name: /listen later/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^rate$/i })).toBeInTheDocument();
  });

  it("drops Listen Later (only Rate) when an accepted invite exists", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    // No draft rating, but an invite for this album was accepted → it's already a
    // committed shared listen, so a fresh "Listen Later" doesn't apply.
    vi.mocked(getListenLater).mockResolvedValue([
      {
        album: ALBUM,
        rating: null,
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
    ]);
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    expect(await screen.findByRole("button", { name: /^rate$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /listen later/i })).not.toBeInTheDocument();
  });

  it("marks a friend as Invited (disabled) when a pending invite already exists", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    vi.mocked(listMyInvites).mockResolvedValue({
      incoming: [],
      outgoing: [
        {
          id: 5,
          sender_username: "me",
          receiver_username: "bob",
          sender_picture_url: null,
          receiver_picture_url: null,
          album_id: 1,
          status: "pending",
          created_at: "",
          responded_at: null,
          album: ALBUM,
        },
      ],
    });
    vi.mocked(listFriendships).mockResolvedValue({
      accepted: [
        {
          id: 1,
          user_a_username: "me",
          user_b_username: "bob",
          user_a_picture_url: null,
          user_b_picture_url: null,
          user_a_visibility: "public",
          user_b_visibility: "public",
          status: "accepted",
          requested_by: "me",
          requested_by_picture_url: null,
          created_at: "",
          accepted_at: "",
        },
      ],
    });
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.click(screen.getByRole("button", { name: /invite a friend/i }));
    const invitedBtn = await screen.findByRole("button", { name: /^invited$/i });
    expect(invitedBtn).toBeDisabled();
  });

  it("marks a friend as 'Listening' (disabled) when an accepted invite exists", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    // bob accepted an invite for this album → accepted participant, no re-invite.
    vi.mocked(getListenLater).mockResolvedValue([
      {
        album: ALBUM,
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
    ]);
    vi.mocked(listFriendships).mockResolvedValue({
      accepted: [
        {
          id: 1,
          user_a_username: "me",
          user_b_username: "bob",
          user_a_picture_url: null,
          user_b_picture_url: null,
          user_a_visibility: "public",
          user_b_visibility: "public",
          status: "accepted",
          requested_by: "me",
          requested_by_picture_url: null,
          created_at: "",
          accepted_at: "",
        },
      ],
    });
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.click(screen.getByRole("button", { name: /invite a friend/i }));
    const btn = await screen.findByRole("button", { name: /^listening$/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/already listening with you/i)).toBeInTheDocument();
  });

  it("keeps Listen Later when I sent an invite that is still pending", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    // Pending outgoing invite → still shows in listMyInvites, not yet accepted.
    vi.mocked(listMyInvites).mockResolvedValue({
      incoming: [],
      outgoing: [
        {
          id: 5,
          sender_username: "me",
          receiver_username: "bob",
          sender_picture_url: null,
          receiver_picture_url: null,
          album_id: 1,
          status: "pending",
          created_at: "",
          responded_at: null,
          album: ALBUM,
        },
      ],
    });
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    // A merely-pending invite does not commit me — I still get "Listen Later".
    expect(await screen.findByRole("button", { name: /listen later/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^rate$/i })).toBeInTheDocument();
  });

  it("marks a friend as 'Invited you' (disabled) when they invited me first", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    // Incoming pending invite from bob for this album.
    vi.mocked(listMyInvites).mockResolvedValue({
      incoming: [
        {
          id: 7,
          sender_username: "bob",
          receiver_username: "me",
          sender_picture_url: null,
          receiver_picture_url: null,
          album_id: 1,
          status: "pending",
          created_at: "",
          responded_at: null,
          album: ALBUM,
        },
      ],
      outgoing: [],
    });
    vi.mocked(listFriendships).mockResolvedValue({
      accepted: [
        {
          id: 1,
          user_a_username: "me",
          user_b_username: "bob",
          user_a_picture_url: null,
          user_b_picture_url: null,
          user_a_visibility: "public",
          user_b_visibility: "public",
          status: "accepted",
          requested_by: "me",
          requested_by_picture_url: null,
          created_at: "",
          accepted_at: "",
        },
      ],
    });
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.click(screen.getByRole("button", { name: /invite a friend/i }));
    const btn = await screen.findByRole("button", { name: /invited you/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/bob already invited you/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // "See a friend's ratings" picker
  // -------------------------------------------------------------------------

  const BOB_RATING = {
    username: "bob",
    display_name: "Bob",
    profile_picture_url: null,
    friendship_id: 42,
  };

  it("hides the friend picker when no friends have rated the album", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });
    expect(screen.queryByText(/see a friend's ratings/i)).not.toBeInTheDocument();
  });

  it("opens the pair comparison when you've rated the album and pick a friend", async () => {
    vi.mocked(getAlbumFriendRatings).mockResolvedValue([BOB_RATING]);
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.focus(screen.getByPlaceholderText(/search friends/i));
    fireEvent.click(screen.getByRole("option", { name: /bob/i }));

    expect(navSpy).toHaveBeenCalledWith("/friendships/42/albums/alb1", {
      state: {
        backTo: {
          profile: "bob",
          compareSource: { kind: "friendship", friendshipId: 42 },
        },
      },
    });
  });

  it("opens the friend-vs-Spotify view when you haven't rated the album", async () => {
    vi.mocked(getMyRatingForAlbum).mockRejectedValue(new Error("no rating"));
    vi.mocked(getAlbumFriendRatings).mockResolvedValue([BOB_RATING]);
    renderPage();
    await screen.findByRole("link", { name: "Test Album" });

    fireEvent.focus(screen.getByPlaceholderText(/search friends/i));
    fireEvent.click(screen.getByRole("option", { name: /bob/i }));

    expect(navSpy).toHaveBeenCalledWith("/users/bob/albums/alb1", {
      state: { backTo: { profile: "bob", compareSource: null } },
    });
  });
});
