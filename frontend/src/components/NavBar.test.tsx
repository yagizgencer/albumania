import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavBar } from "./NavBar";
import { searchAlbums } from "../api/albums";
import { searchArtists } from "../api/artists";

vi.mock("../api/albums", () => ({ searchAlbums: vi.fn() }));
vi.mock("../api/artists", () => ({ searchArtists: vi.fn() }));

const logout = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ username: "alice", logout, profile: null }),
}));
vi.mock("../context/NotificationsContext", () => ({
  useNotifications: () => ({
    summary: { bell: 0, listen_invites: 0, friend_requests: 0 },
    markSeen: vi.fn(),
    refresh: vi.fn(),
  }),
}));

function renderNav() {
  return render(
    <MemoryRouter>
      <NavBar />
    </MemoryRouter>
  );
}

const ALBUM = {
  spotify_id: "alb1",
  title: "Test Album",
  artist: "The Artist",
  artist_spotify_id: "art1",
  release_date: "2024-01-01",
  total_songs: 10,
  album_art_url: null,
};
const ARTIST = { spotify_id: "art1", name: "The Artist", image_url: null };

describe("NavBar", () => {
  beforeEach(() => {
    vi.mocked(searchAlbums).mockResolvedValue([ALBUM]);
    vi.mocked(searchArtists).mockResolvedValue([ARTIST]);
    logout.mockClear();
  });

  it("renders the global search and a working profile dropdown", async () => {
    renderNav();

    expect(screen.getByLabelText(/search albums and artists/i)).toBeInTheDocument();

    // Menu items are hidden until the avatar button is clicked.
    expect(screen.queryByRole("menuitem", { name: /log out/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();
    const logoutItem = screen.getByRole("menuitem", { name: /log out/i });
    expect(logoutItem).toBeInTheDocument();

    fireEvent.click(logoutItem);
    expect(logout).toHaveBeenCalled();
  });

  it("filters results by type when chips are clicked", async () => {
    renderNav();

    const input = screen.getByLabelText(/search albums and artists/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "test" } });

    // "All" → both an artist and an album result appear (debounced fetch).
    const list = await screen.findByRole("listbox");
    await waitFor(() => {
      expect(within(list).getByText("Album")).toBeInTheDocument();
      expect(within(list).getByText("Artist")).toBeInTheDocument();
    });

    // Switch to "Artists" → only artist results remain.
    fireEvent.click(screen.getByRole("tab", { name: "Artists" }));
    await waitFor(() => {
      expect(within(screen.getByRole("listbox")).queryByText("Album")).not.toBeInTheDocument();
      expect(within(screen.getByRole("listbox")).getByText("Artist")).toBeInTheDocument();
    });
  });

  it("orders results by relevance, mixing albums and artists (not artists-first)", async () => {
    // The album's title matches the query exactly; the artist only contains it.
    // A relevance mix must therefore surface the album ABOVE the artist, even
    // though artists used to always come first.
    vi.mocked(searchAlbums).mockResolvedValue([
      { ...ALBUM, spotify_id: "exact", title: "Halcyon" },
    ]);
    vi.mocked(searchArtists).mockResolvedValue([
      { spotify_id: "loose", name: "Halcyon Days Band", image_url: null },
    ]);

    renderNav();
    const input = screen.getByLabelText(/search albums and artists/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "halcyon" } });

    const list = await screen.findByRole("listbox");
    await waitFor(() => {
      expect(within(list).getByText("Halcyon")).toBeInTheDocument();
    });

    const options = within(list).getAllByRole("option");
    // Exact-title album first, looser artist match second.
    expect(options[0]).toHaveTextContent("Halcyon");
    expect(options[0]).toHaveTextContent("Album");
    expect(options[1]).toHaveTextContent("Halcyon Days Band");
    expect(options[1]).toHaveTextContent("Artist");
  });
});
